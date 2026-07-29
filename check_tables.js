const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('agecare.db');
db.all("SELECT name FROM sqlite_master WHERE type = 'table'", (e, r) => {
  if (e) console.log('Error:', e.message);
  else console.log('Tables:', r.map(t => t.name).join(', '));
  db.close();
});
