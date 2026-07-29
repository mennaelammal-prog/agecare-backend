const db = require('./src/db/client');

async function setup() {
  try {
    // Family members table
    await db.query(`
      CREATE TABLE IF NOT EXISTS family_members (
        id SERIAL PRIMARY KEY,
        senior_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        relationship TEXT,
        notify_email BOOLEAN DEFAULT true,
        notify_sms BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ family_members table created');

    // Emergency alerts table
    await db.query(`
      CREATE TABLE IF NOT EXISTS emergency_alerts (
        id SERIAL PRIMARY KEY,
        senior_id INTEGER NOT NULL,
        checkin_id INTEGER,
        alert_type TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    console.log('✅ emergency_alerts table created');

    // Multiple seniors support - add to existing seniors/users table if needed
    await db.query(`
      CREATE TABLE IF NOT EXISTS seniors (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        pin TEXT NOT NULL,
        date_of_birth DATE,
        emergency_contact TEXT,
        medical_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ seniors table created');

    // Mood history for charts
    await db.query(`
      CREATE TABLE IF NOT EXISTS mood_history (
        id SERIAL PRIMARY KEY,
        senior_id INTEGER NOT NULL,
        checkin_id INTEGER,
        mood_rating INTEGER CHECK (mood_rating BETWEEN 1 AND 5),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ mood_history table created');

    console.log('All new tables ready!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

setup();
