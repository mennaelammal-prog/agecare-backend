const db = require('./src/db/client');

async function setup() {
  try {
    const check = await db.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkins')");
    const exists = check.rows[0].exists;
    console.log('Table exists:', exists);

    if (!exists) {
      console.log('Creating checkins table...');
      await db.query(`
        CREATE TABLE checkins (
          id SERIAL PRIMARY KEY,
          senior_id INTEGER NOT NULL,
          summary_text TEXT,
          mood_rating INTEGER CHECK (mood_rating BETWEEN 1 AND 5),
          medication_confirmed BOOLEAN,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Table created successfully!');
    } else {
      console.log('Table already exists. No changes needed.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

setup();
