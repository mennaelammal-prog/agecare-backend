const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.json({ success: true, reply: 'You asked: "' + message + '". AI is not configured. Please add CLAUDE_API_KEY or ANTHROPIC_API_KEY.' });
    }

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      system: 'You are a helpful health assistant for elderly care. Provide general wellness advice. Always recommend seeing a doctor for serious symptoms.',
      messages: [
        { role: 'user', content: message }
      ]
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });

    const reply = response.data.content[0].text;
    res.json({ success: true, reply });
  } catch (err) {
    console.error('[Chat] Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Chat failed', details: err.message });
  }
});

module.exports = router;