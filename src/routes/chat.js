const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.json({ success: true, reply: 'You asked: "' + message + '". AI is not configured. Please add OPENAI_API_KEY.' });
    }

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful health assistant for elderly care. Provide general wellness advice. Always recommend seeing a doctor for serious symptoms.' },
        { role: 'user', content: message }
      ],
      max_tokens: 150
    }, {
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      }
    });

    const reply = response.data.choices[0].message.content;
    res.json({ success: true, reply });
  } catch (err) {
    console.error('[Chat] Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Chat failed', details: err.message });
  }
});

module.exports = router;