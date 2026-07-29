const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const checkinRoutes = require('./routes/checkin');
const db = require('./db/client');

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/checkin', checkinRoutes);

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running perfectly!' });
});

app.get('/api/testdb', async (req, res) => {
  try {
    const result = await db.query('SELECT name FROM users WHERE role = $1', ['senior']);
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Check-In backend running on http://localhost:${PORT}`);
});