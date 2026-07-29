const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

/**
 * POST /api/family - Add a family contact
 */
router.post('/', authMiddleware, async (req, res) => {
  const { name, relationship, email, phone, notify_email, notify_sms } = req.body;
  const userId = req.userId;

  try {
    const db = getDb();

    const contact = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO family_contacts (user_id, name, relationship, email, phone, notify_email, notify_sms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, relationship, email || null, phone || null, notify_email ? 1 : 0, notify_sms ? 1 : 0],
        function(err) {
          if (err) return reject(err);
          resolve({
            id: this.lastID,
            user_id: userId,
            name,
            relationship,
            email,
            phone,
            notify_email,
            notify_sms,
          });
        }
      );
    });

    res.status(201).json({
      success: true,
      message: 'Family contact added',
      data: contact,
    });

  } catch (err) {
    console.error('[Family] Add error:', err.message);
    res.status(500).json({ error: 'Failed to add contact', details: err.message });
  }
});

/**
 * GET /api/family - List family contacts
 */
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.userId;

  try {
    const db = getDb();

    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM family_contacts 
         WHERE user_id = ? AND is_active = 1 
         ORDER BY created_at DESC`,
        [userId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });

  } catch (err) {
    console.error('[Family] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

/**
 * DELETE /api/family/:id - Remove a family contact
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const contactId = req.params.id;

  try {
    const db = getDb();

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE family_contacts SET is_active = 0 WHERE id = ? AND user_id = ?`,
        [contactId, userId],
        function(err) {
          if (err) return reject(err);
          if (this.changes === 0) {
            return reject(new Error('Contact not found'));
          }
          resolve();
        }
      );
    });

    res.json({
      success: true,
      message: 'Contact removed',
    });

  } catch (err) {
    console.error('[Family] Delete error:', err.message);
    res.status(err.message === 'Contact not found' ? 404 : 500).json({
      error: err.message,
    });
  }
});

module.exports = router;