const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/client');

const router = express.Router();

router.post('/senior-login', async (req, res) => {
  try {
    const { pin } = req.body;
    const { rows } = await db.query(
      "SELECT id, name, pin_hash FROM users WHERE role = 'senior' LIMIT 1"
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });

    const ok = bcrypt.compareSync(pin, rows[0].pin_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect PIN' });

    const token = jwt.sign(
      { userId: rows[0].id, role: 'senior' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, user: { id: rows[0].id, name: rows[0].name } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

module.exports = router;