const { Pool } = require('pg');
const db = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/checkin' });
db.query('SELECT name FROM users WHERE role = $1', ['senior'])
  .then(res => { console.log('SUCCESS! User found:', res.rows[0].name); process.exit(0); })
  .catch(err => { console.log('FAILED! Error:', err.message); process.exit(1); });