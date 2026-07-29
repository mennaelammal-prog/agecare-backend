const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const db = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/checkin'
});
(async () => {
  const before = await db.query("SELECT length(pin_hash) AS len FROM users WHERE name = $1", ['Grandma Betty']);
  const newHash = bcrypt.hashSync('1234', 10);
  await db.query("UPDATE users SET pin_hash = $1 WHERE name = $2", [newHash, 'Grandma Betty']);
  const after = await db.query("SELECT length(pin_hash) AS len FROM users WHERE name = $1", ['Grandma Betty']);
  console.log(JSON.stringify({ before: before.rows[0], newHashLen: newHash.length, after: after.rows[0] }));
  process.exit(0);
})().catch(e => { console.log('ERR:', e.message); process.exit(1); });