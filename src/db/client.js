const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set - check backend/.env exists and dotenv loaded it.');
}

const db = new Pool({ connectionString });

module.exports = db;