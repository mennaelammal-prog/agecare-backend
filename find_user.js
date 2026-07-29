const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('agecare.db');
db.all("SELECT id, email, name FROM users", (e, r) => {
  if (e) console.log('Error:', e.message);
  else r.forEach(u => console.log('User ID:', u.id, '| Email:', u.email, '| Name:', u.name));
  db.close();
});
