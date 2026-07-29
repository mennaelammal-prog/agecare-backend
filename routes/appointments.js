const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.post('/', authMiddleware, async (req, res) => {
  const { doctor_name, specialty, location, appointment_date, notes } = req.body;
  const userId = req.userId;
  try {
    const db = getDb();
    const appt = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO appointments (user_id, doctor_name, specialty, location, appointment_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, doctor_name, specialty || null, location || null, appointment_date, notes || null],
        function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, user_id: userId, doctor_name, specialty, location, appointment_date, notes });
        }
      );
    });
    res.status(201).json({ success: true, message: 'Appointment added', data: appt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add appointment', details: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { doctor_name, specialty, location, appointment_date, notes, is_active } = req.body;
  const userId = req.userId;
  try {
    const db = getDb();
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE appointments SET doctor_name=?, specialty=?, location=?, appointment_date=?, notes=?, is_active=?
         WHERE id=? AND user_id=?`,
        [doctor_name, specialty || null, location || null, appointment_date, notes || null, is_active !== undefined ? is_active : 1, req.params.id, userId],
        function(err) {
          if (err) return reject(err);
          if (this.changes === 0) return reject(new Error('Not found'));
          resolve();
        }
      );
    });
    res.json({ success: true, message: 'Appointment updated' });
  } catch (err) {
    res.status(err.message === 'Not found' ? 404 : 500).json({ error: err.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  const userId = req.userId;
  try {
    const db = getDb();
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM appointments WHERE user_id = ? AND is_active = 1 ORDER BY appointment_date ASC`,
        [userId],
        (err, rows) => { if (err) return reject(err); resolve(rows); }
      );
    });
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.userId;
  try {
    const db = getDb();
    await new Promise((resolve, reject) => {
      db.run(`UPDATE appointments SET is_active = 0 WHERE id = ? AND user_id = ?`, [req.params.id, userId], function(err) {
        if (err) return reject(err);
        if (this.changes === 0) return reject(new Error('Not found'));
        resolve();
      });
    });
    res.json({ success: true, message: 'Appointment removed' });
  } catch (err) {
    res.status(err.message === 'Not found' ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;