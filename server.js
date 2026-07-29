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

// Middleware
app.use(helmet());
app.use(cors());
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

// Start server
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  Age Care Backend Server`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`========================================`);
  getDb();
});

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