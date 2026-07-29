const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { askClaude } = require('../services/claude');
const { notifyFamily } = require('../services/notification');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

/**
 * POST /api/checkin - Submit a daily check-in
 */
router.post('/', authMiddleware, validate('checkin'), async (req, res) => {
  const { mood, energy, pain, sleep_hours, notes } = req.body;
  const userId = req.userId;

  try {
    const db = getDb();

    // Get AI response about the check-in
    const systemPrompt = `You are a caring health assistant for elderly care. 
Analyze the daily check-in data and provide a brief, warm, encouraging response. 
Keep it under 150 words. Be supportive and mention any concerns gently.`;

    const userMessage = `Daily check-in:
- Mood: ${mood}/5
- Energy: ${energy}/5  
- Pain: ${pain}/10
- Sleep: ${sleep_hours || 'Not recorded'} hours
- Notes: ${notes || 'None'}`;

    let aiResponse;
    try {
      const result = await askClaude({
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
        maxTokens: 300,
      });
      aiResponse = result.text;
    } catch (err) {
      console.error('[Checkin] AI response failed:', err.message);
      aiResponse = 'Thank you for your check-in. Stay healthy!';
    }

    // Save check-in
    const checkin = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO checkins (user_id, mood, energy, pain, sleep_hours, notes, ai_response)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, mood, energy, pain, sleep_hours || null, notes || null, aiResponse],
        function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, userId, mood, energy, pain, sleep_hours, notes, ai_response: aiResponse });
        }
      );
    });

    // Notify family (don't wait for it)
    notifyFamily(checkin.id, userId).catch(err => {
      console.error('[Checkin] Family notification failed:', err.message);
    });

    res.status(201).json({
      success: true,
      message: 'Check-in recorded successfully',
      data: checkin,
    });

  } catch (err) {
    console.error('[Checkin] Error:', err.message);
    res.status(500).json({ error: 'Failed to save check-in', details: err.message });
  }
});

/**
 * GET /api/checkin/history - Get check-in history
 */
router.get('/history', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const limit = parseInt(req.query.limit) || 30;

  try {
    const db = getDb();

    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM checkins 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [userId, limit],
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
    console.error('[Checkin] History error:', err.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;