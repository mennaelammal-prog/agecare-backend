const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('agecare.db');
db.all("PRAGMA table_info(users)", (e, r) => {
  if (e) console.log('Error:', e.message);
  else {
    console.log('Users table columns:');
    r.forEach(c => console.log('  ' + c.name + ' (' + c.type + ')'));
  }
  db.close();
});
