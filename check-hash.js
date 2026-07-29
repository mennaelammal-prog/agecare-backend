const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const db = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/checkin'
});

(async () => {
  try {
    const before = await db.query(
      "SELECT name, pin_hash, length(pin_hash) AS hash_len FROM users WHERE name = $1",
      ['Grandma Betty']
    );
    console.log('BEFORE:', before.rows);

    const hash = bcrypt.hashSync('1234', 10);
    console.log('NEW HASH (len 60):', hash);

    const upd = await db.query(
      "UPDATE users SET pin_hash = $1 WHERE name = $2",
      [hash, 'Grandma Betty']
    );
    console.log('UPDATED rows:', upd.rowCount);

    const after = await db.query(
      "SELECT length(pin_hash) AS hash_len FROM users WHERE name = $1",
      ['Grandma Betty']
    );
    console.log('AFTER:', after.rows);

    process.exit(0);
  } catch (e) {
    console.log('ERR:', e.message);
    process.exit(1);
  }
})();