const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const reply = 'You asked: "' + message + '". This is a placeholder AI response. To enable real AI, add an OPENAI_API_KEY to your environment variables.';
    res.json({ success: true, reply });
  } catch (err) {
    console.error('[Chat] Error:', err);
    res.status(500).json({ error: 'Chat failed', details: err.message });
  }
});

module.exports = router;