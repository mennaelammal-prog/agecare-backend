const { Pool } = require('pg');

function convertPlaceholders(sql) {
  let index = 0;
  return sql
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\?/g, () => `$${++index}`);
}

function isWriteStatement(sql) {
  return /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql);
}

function withReturningId(sql) {
  const trimmed = sql.trim().replace(/;$/, '');
  if (!/^\s*INSERT\b/i.test(trimmed) || /\bRETURNING\b/i.test(trimmed)) return trimmed;
  return `${trimmed} RETURNING id`;
}

class PostgresCompatDatabase {
  constructor(connectionString, pool) {
    this.pool = pool || new Pool({ connectionString, max: 5 });
  }

  get(sql, params, callback) {
    this.pool.query(convertPlaceholders(sql), params || [])
      .then((result) => callback(null, result.rows[0]))
      .catch((error) => callback(error));
  }

  all(sql, params, callback) {
    this.pool.query(convertPlaceholders(sql), params || [])
      .then((result) => callback(null, result.rows))
      .catch((error) => callback(error));
  }

  run(sql, params, callback) {
    const values = Array.isArray(params) ? params : [];
    const done = typeof params === 'function' ? params : callback;
    const query = isWriteStatement(sql) ? withReturningId(convertPlaceholders(sql)) : convertPlaceholders(sql);
    this.pool.query(query, values)
      .then((result) => done && done.call({ lastID: result.rows[0]?.id, changes: result.rowCount }, null))
      .catch((error) => done && done.call({ lastID: undefined, changes: 0 }, error));
  }

  exec(sql, callback) {
    this.pool.query(sql)
      .then(() => callback && callback(null))
      .catch((error) => callback && callback(error));
  }

  close(callback) {
    this.pool.end().then(() => callback && callback(null)).catch((error) => callback && callback(error));
  }
}

module.exports = { PostgresCompatDatabase, convertPlaceholders };
