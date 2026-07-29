const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("agecare.db");

db.run("ALTER TABLE family_contacts ADD COLUMN linked_user_id INTEGER", function(err) {
  if (err) {
    console.log("Column may already exist:", err.message);
  } else {
    console.log("Added linked_user_id column");
  }
  
  db.run("CREATE INDEX IF NOT EXISTS idx_family_linked ON family_contacts(linked_user_id)", function(err) {
    if (err) console.log("Index error:", err.message);
    else console.log("Index created");
    db.close();
    console.log("Migration done");
  });
});