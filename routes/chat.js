const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { askClaude, streamClaude } = require('../services/claude');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

/**
 * POST /api/chat - Regular chat (non-streaming)
 */
router.post('/', authMiddleware, validate('chat'), async (req, res) => {
  const { message, history } = req.body;
  const userId = req.userId;

  try {
    const db = getDb();

    // Build messages array
    const messages = history ? [...history] : [];
    messages.push({ role: 'user', content: message });

    const systemPrompt = `You are a caring, patient health assistant for elderly users and their families. 
You provide warm, clear, supportive advice about health, wellness, and daily care. 
Keep responses concise (under 200 words) and easy to understand. 
If someone reports serious symptoms, gently suggest seeing a doctor.`;

    const result = await askClaude({
      messages,
      system: systemPrompt,
      maxTokens: 500,
    });

    // Save to history
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO chat_history (user_id, role, content, model, tokens_used)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, 'user', message, result.model, result.usage?.input_tokens],
        (err) => {
          if (err) return reject(err);
          db.run(
            `INSERT INTO chat_history (user_id, role, content, model, tokens_used)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, 'assistant', result.text, result.model, result.usage?.output_tokens],
            (err) => {
              if (err) return reject(err);
              resolve();
            }
          );
        }
      );
    });

    res.json({
      success: true,
      data: {
        response: result.text,
        model: result.model,
        usage: result.usage,
      },
    });

  } catch (err) {
    console.error('[Chat] Error:', err.message);
    res.status(500).json({ error: 'Chat failed', details: err.message });
  }
});

/**
 * POST /api/chat/stream - Streaming chat (SSE)
 */
router.post('/stream', authMiddleware, validate('chat'), async (req, res) => {
  const { message, history } = req.body;
  const userId = req.userId;

  try {
    const messages = history ? [...history] : [];
    messages.push({ role: 'user', content: message });

    const systemPrompt = `You are a caring, patient health assistant for elderly users and their families. 
You provide warm, clear, supportive advice about health, wellness, and daily care. 
Keep responses concise (under 200 words) and easy to understand.`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    for await (const chunk of streamClaude({
      messages,
      system: systemPrompt,
      maxTokens: 500,
    })) {
      if (chunk.type === 'text') {
        fullResponse += chunk.text;
        res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.text })}\n\n`);
      } else if (chunk.type === 'done') {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

    // Save to history (fire and forget)
    const db = getDb();
    db.run(
      `INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`,
      [userId, 'user', message]
    );
    db.run(
      `INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`,
      [userId, 'assistant', fullResponse]
    );

  } catch (err) {
    console.error('[Chat] Stream error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/chat/history - Get chat history
 */
router.get('/history', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const db = getDb();

    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, role, content, model, tokens_used, created_at 
         FROM chat_history 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [userId, limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows.reverse()); // Oldest first
        }
      );
    });

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });

  } catch (err) {
    console.error('[Chat] History error:', err.message);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

module.exports = router;