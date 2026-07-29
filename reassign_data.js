const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("agecare.db");
const OLD_USER_ID = 1;
const NEW_USER_ID = 3;

const tables = ["checkins", "medications", "appointments", "vitals", "family_contacts", "chat_history"];

async function reassign() {
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    await new Promise(function(resolve, reject) {
      db.run(
        "UPDATE " + t + " SET user_id = ? WHERE user_id = ?",
        [NEW_USER_ID, OLD_USER_ID],
        function(err) {
          if (err) {
            console.log("[SKIP] " + t + " - " + err.message);
            resolve();
          } else {
            console.log("[REASSIGNED] " + t + ": " + this.changes + " records moved from User " + OLD_USER_ID + " to User " + NEW_USER_ID);
            resolve();
          }
        }
      );
    });
  }
  db.close();
  console.log("Done! Refresh your browser.");
}

reassign();