const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';
const SALT_ROUNDS = 10;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ chars' });

  try {
    const db = getDb();
    const existing = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (email, password_hash, name, updated_at) VALUES (?, ?, ?, datetime("now"))',
        [email, password_hash, full_name || null],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, email, name: full_name || '' });
        }
      );
    });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, message: 'Account created', token, user });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Failed to create account', details: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const db = getDb();
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, message: 'Login successful', token, user: { id: user.id, email: user.email, full_name: user.name } });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, email, name FROM users WHERE id = ?', [decoded.userId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: { ...user, full_name: user.name } });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;