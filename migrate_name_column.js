const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("agecare.db");

db.run("ALTER TABLE users ADD COLUMN name TEXT", function(err) {
  if (err) console.log("name column may already exist:", err.message);
  else console.log("Added name column to users table");
  db.close();
  console.log("Migration done");
});