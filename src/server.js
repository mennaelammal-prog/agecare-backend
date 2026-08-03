require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { getDb } = require('./db');
const { apiLimiter } = require('./middleware/rateLimiter');
const { authMiddleware } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const checkinRoutes = require('./routes/checkin');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: ['https://agecare-frontend.onrender.com', 'http://localhost:5173', 'http://localhost:3001'],
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/checkin', authMiddleware, checkinRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('[Server] Error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const db = getDb();

function runMigration(sql, label) {
  return new Promise((resolve) => {
    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column') || err.message.includes('already exists')) {
          console.log('[Migration] ' + label + ': already exists');
        } else {
          console.log('[Migration] ' + label + ' error:', err.message);
        }
      } else {
        console.log('[Migration] ' + label + ': added');
      }
      resolve();
    });
  });
}

async function startServer() {
  await runMigration('ALTER TABLE users ADD COLUMN name TEXT', 'name column');
  await runMigration('ALTER TABLE users ADD COLUMN updated_at TEXT', 'updated_at column');
  await runMigration('ALTER TABLE users ADD COLUMN reset_token TEXT', 'reset_token column');
  await runMigration('ALTER TABLE users ADD COLUMN reset_expires INTEGER', 'reset_expires column');

  app.listen(PORT, () => {
    console.log('========================================');
    console.log('  Age Care Backend Server');
    console.log('  Running on port ' + PORT);
    console.log('  Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('========================================');
  });
}

startServer();

process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  const { closeDb } = require('./db');
  closeDb();
  process.exit(0);
});
