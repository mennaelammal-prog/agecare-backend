const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.post('/', authMiddleware, async (req, res) => {
  const { blood_pressure_sys, blood_pressure_dia, heart_rate, temperature, weight, blood_sugar, spo2, notes } = req.body;
  const userId = req.userId;
  try {
    const db = getDb();
    const vital = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO vital_signs (user_id, blood_pressure_sys, blood_pressure_dia, heart_rate, temperature, weight, blood_sugar, spo2, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, blood_pressure_sys || null, blood_pressure_dia || null, heart_rate || null, temperature || null, weight || null, blood_sugar || null, spo2 || null, notes || null],
        function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, user_id: userId, blood_pressure_sys, blood_pressure_dia, heart_rate, temperature, weight, blood_sugar, spo2, notes });
        }
      );
    });
    res.status(201).json({ success: true, message: 'Vital signs recorded', data: vital });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record vitals', details: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { blood_pressure_sys, blood_pressure_dia, heart_rate, temperature, weight, blood_sugar, spo2, notes } = req.body;
  const userId = req.userId;
  try {
    const db = getDb();
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE vital_signs SET blood_pressure_sys=?, blood_pressure_dia=?, heart_rate=?, temperature=?, weight=?, blood_sugar=?, spo2=?, notes=?
         WHERE id=? AND user_id=?`,
        [blood_pressure_sys || null, blood_pressure_dia || null, heart_rate || null, temperature || null, weight || null, blood_sugar || null, spo2 || null, notes || null, req.params.id, userId],
        function(err) {
          if (err) return reject(err);
          if (this.changes === 0) return reject(new Error('Not found'));
          resolve();
        }
      );
    });
    res.json({ success: true, message: 'Vital signs updated' });
  } catch (err) {
    res.status(err.message === 'Not found' ? 404 : 500).json({ error: err.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const limit = parseInt(req.query.limit) || 30;
  try {
    const db = getDb();
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM vital_signs WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?`,
        [userId, limit],
        (err, rows) => { if (err) return reject(err); resolve(rows); }
      );
    });
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vitals' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.userId;
  try {
    const db = getDb();
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM vital_signs WHERE id = ? AND user_id = ?`, [req.params.id, userId], function(err) {
        if (err) return reject(err);
        if (this.changes === 0) return reject(new Error('Not found'));
        resolve();
      });
    });
    res.json({ success: true, message: 'Vital record removed' });
  } catch (err) {
    res.status(err.message === 'Not found' ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;