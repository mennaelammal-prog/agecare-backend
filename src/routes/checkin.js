const express = require('express');
const { getDb } = require('../db');
const router = express.Router();

router.post('/', async (req, res) => {
  const { mood, notes } = req.body;
  const db = getDb();
  try {
    const result = await new Promise((resolve, reject) => {
      db.run('INSERT INTO checkins (user_id, mood, notes) VALUES (?, ?, ?)', [req.userId, mood, notes], function(err) {
        if (err) reject(err); else resolve({ id: this.lastID });
      });
    });
    res.json({ success: true, id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const db = getDb();
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC', [req.userId], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    res.json({ success: true, checkins: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
