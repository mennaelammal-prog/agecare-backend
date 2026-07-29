const db = require('./src/db/client');

async function setup() {
  try {
    // Knowledge Graph entities table
    await db.query(`
      CREATE TABLE IF NOT EXISTS kg_entities (
        id SERIAL PRIMARY KEY,
        senior_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        name TEXT NOT NULL,
        properties JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(senior_id, label, name)
      )
    `);
    console.log('✅ kg_entities table created');

    // Knowledge Graph relations table
    await db.query(`
      CREATE TABLE IF NOT EXISTS kg_relations (
        id SERIAL PRIMARY KEY,
        senior_id INTEGER NOT NULL,
        source_name TEXT NOT NULL,
        predicate TEXT NOT NULL,
        target_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ kg_relations table created');

    // Reflexion lessons table
    await db.query(`
      CREATE TABLE IF NOT EXISTS reflexion_lessons (
        id SERIAL PRIMARY KEY,
        senior_id INTEGER,
        task_type TEXT NOT NULL,
        error TEXT NOT NULL,
        lesson TEXT NOT NULL,
        strategy TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ reflexion_lessons table created');

    console.log('All tables ready!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

setup();
