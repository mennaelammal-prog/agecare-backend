const { getDb } = require('./db');

const db = getDb();

// Insert demo user if not exists
db.run(
  `INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (1, 'user@agecare.app', 'demo', 'Demo User')`,
  function(err) {
    if (err) {
      console.error('Seed error:', err.message);
    } else {
      console.log('Demo user created/verified (ID: 1)');
    }
    db.close();
  }
);