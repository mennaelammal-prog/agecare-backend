const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("agecare.db");
const USER_ID = 3;

const tables = ["checkins", "medications", "appointments", "vitals", "family_contacts", "chat_history"];

async function linkData() {
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    await new Promise(function(resolve, reject) {
      db.run(
        "UPDATE " + t + " SET user_id = ? WHERE user_id IS NULL OR user_id = 0",
        [USER_ID],
        function(err) {
          if (err) {
            console.log("[SKIP] " + t + " - " + err.message);
            resolve();
          } else {
            console.log("[LINKED] " + t + ": " + this.changes + " records assigned to User " + USER_ID);
            resolve();
          }
        }
      );
    });
  }
  db.close();
  console.log("Done! Refresh your browser to see old data.");
}

linkData();