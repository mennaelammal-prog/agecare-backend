require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { getDb, getDatabaseHealth, isPostgres } = require('./db');
const { runPostgresSchema } = require('./database/postgresSchema');
const { apiLimiter } = require('./middleware/rateLimiter');
const { authMiddleware } = require('./middleware/auth');

// Import routes
const checkinRoutes = require('./routes/checkin');
const familyRoutes = require('./routes/family');
const chatRoutes = require('./routes/chat');
const medicationRoutes = require('./routes/medications');
const appointmentRoutes = require('./routes/appointments');
const vitalRoutes = require('./routes/vitals');
const authRoutes = require('./routes/auth');
const familyLinkRoutes = require('./routes/familyLink');
const careAccessRoutes = require('./routes/careAccess');
const pushRoutes = require('./routes/push');
const sosRoutes = require('./routes/sos');
const { statements: careAccessMigrations } = require('./migrations/careAccess');
const { statements: familyContactMigrations } = require('./migrations/familyContacts');
const { statements: notificationMigrations } = require('./migrations/notifications');
const reminderScheduler = require('./services/reminderScheduler');

const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigins = [
  'https://agecare-frontend.onrender.com',
  'https://family-care-chi.vercel.app',
  'https://family-care-em3wyiw9e-family-care2.vercel.app',
  'http://localhost:5173',
  'http://localhost:3001',
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
];

// Trust proxy (REQUIRED for Render + express-rate-limit)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(apiLimiter);

// Health check
app.get('/api/health', async (req, res) => {
  const database = await getDatabaseHealth();
  const status = database.connection === 'ready' ? 200 : 503;
  res.status(status).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database,
  });
});

// Public routes (no auth needed)
app.use('/api/auth', authRoutes);
app.use('/api/family/link', authMiddleware, familyLinkRoutes);
app.use('/api/care-access', authMiddleware, careAccessRoutes);

// Protected routes (require login token)
app.use('/api/checkin', authMiddleware, checkinRoutes);
app.use('/api/family', authMiddleware, familyRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/medications', authMiddleware, medicationRoutes);
app.use('/api/appointments', authMiddleware, appointmentRoutes);
app.use('/api/vitals', authMiddleware, vitalRoutes);
app.use('/api/push', authMiddleware, pushRoutes);
app.use('/api/sos', authMiddleware, sosRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Run migrations then start server
const db = getDb();
app.locals.db = db;

function runMigration(sql, label) {
  return new Promise((resolve) => {
    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column') || err.message.includes('already exists')) {
          console.log(`[Migration] ${label}: already exists`);
        } else {
          console.log(`[Migration] ${label} error:`, err.message);
        }
      } else {
        console.log(`[Migration] ${label}: added`);
      }
      resolve();
    });
  });
}

async function startServer() {
  if (isPostgres()) {
    await runPostgresSchema(db.pool);
    console.log('[Migration] PostgreSQL schema is ready');
  } else {
    await runMigration('ALTER TABLE users ADD COLUMN name TEXT', 'name column');
    await runMigration("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'patient'", 'role column');
    await runMigration('ALTER TABLE users ADD COLUMN updated_at TEXT', 'updated_at column');
    await runMigration('ALTER TABLE users ADD COLUMN reset_token TEXT', 'reset_token column');
    await runMigration('ALTER TABLE users ADD COLUMN reset_expires INTEGER', 'reset_expires column');
    for (const migration of familyContactMigrations) await runMigration(migration.sql, migration.label);
    for (const migration of careAccessMigrations) await runMigration(migration.sql, migration.label);
    for (const migration of notificationMigrations) await runMigration(migration.sql, migration.label);
  }

  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  Age Care Backend Server`);
    console.log(`  Running on http://localhost:${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`========================================`);
  });

  reminderScheduler.start(db);
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  reminderScheduler.stop();
  const { closeDb } = require('./db');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] Shutting down gracefully...');
  reminderScheduler.stop();
  const { closeDb } = require('./db');
  closeDb();
  process.exit(0);
});

module.exports = app;
