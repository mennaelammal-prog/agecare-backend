require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { getDb } = require('./db');
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

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (REQUIRED for Render + express-rate-limit)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['https://agecare-frontend.onrender.com', 'http://localhost:5173', 'http://localhost:3001'],
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(apiLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Public routes (no auth needed)
app.use('/api/auth', authRoutes);
app.use('/api/family/link', authMiddleware, familyLinkRoutes);

// Protected routes (require login token)
app.use('/api/checkin', authMiddleware, checkinRoutes);
app.use('/api/family', authMiddleware, familyRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/medications', authMiddleware, medicationRoutes);
app.use('/api/appointments', authMiddleware, appointmentRoutes);
app.use('/api/vitals', authMiddleware, vitalRoutes);

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
  await runMigration('ALTER TABLE users ADD COLUMN name TEXT', 'name column');
  await runMigration('ALTER TABLE users ADD COLUMN reset_token TEXT', 'reset_token column');
  await runMigration('ALTER TABLE users ADD COLUMN reset_expires INTEGER', 'reset_expires column');

  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  Age Care Backend Server`);
    console.log(`  Running on http://localhost:${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`========================================`);
  });
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  const { closeDb } = require('./db');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] Shutting down gracefully...');
  const { closeDb } = require('./db');
  closeDb();
  process.exit(0);
});

module.exports = app;