const express = require('express');
const db = require('../db/client');
const jwt = require('jsonwebtoken');
const { getClaudeResponse, summarizeConversation } = require('../services/claude');
const { sendCheckInSummary, sendEmergencyAlert } = require('../services/email');

const router = express.Router();
const sessions = new Map();

const checkAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/start', checkAuth, async (req, res) => {
  try {
    const checkinId = Date.now();
    const initialMessage = { role: 'user', content: 'Start check-in' };
    const greeting = await getClaudeResponse([initialMessage]);
    sessions.set(checkinId, [initialMessage, { role: 'assistant', content: greeting }]);
    res.json({ checkinId, message: greeting });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start check-in' });
  }
});

router.post('/continue', checkAuth, async (req, res) => {
  const { checkinId, userMessage } = req.body;
  if (!sessions.has(checkinId)) return res.status(400).json({ error: 'Session not found' });
  try {
    const history = sessions.get(checkinId);
    history.push({ role: 'user', content: userMessage });
    const reply = await getClaudeResponse(history);
    history.push({ role: 'assistant', content: reply });
    sessions.set(checkinId, history);
    res.json({ message: reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get response' });
  }
});


router.post('/end', checkAuth, async (req, res) => {
  const { checkinId } = req.body;
  if (!checkinId) return res.status(400).json({ error: 'checkinId is required' });
  if (!sessions.has(checkinId)) return res.status(400).json({ error: 'Session not found or already ended' });
  
  try {
    const history = sessions.get(checkinId);
    console.log(`Ending session ${checkinId} with ${history.length} messages`);
    const summaryData = await summarizeConversation(history, req.user.userId);
    console.log('Summary generated:', summaryData);
    
    const result = await db.query(
      `INSERT INTO checkins (senior_id, summary_text, mood_rating, medication_confirmed) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [req.user.userId, summaryData.summary, summaryData.mood, summaryData.medTaken]
    );
    console.log('Check-in saved to DB with ID:', result.rows[0].id);
    
    sessions.delete(checkinId);
    res.json({ success: true, summary: summaryData.summary, mood: summaryData.mood, medTaken: summaryData.medTaken, savedAt: result.rows[0].created_at });
  } catch (err) {
    console.error('Failed to end check-in:', err);
    res.status(500).json({ error: 'Failed to end check-in', details: err.message });
  }
});

// Get check-in history for dashboard
router.get('/history', checkAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, summary_text, mood_rating, medication_confirmed, created_at 
       FROM checkins 
       WHERE senior_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get mood data for charts
router.get('/mood-chart', checkAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT mood_rating, recorded_at 
       FROM mood_history 
       WHERE senior_id = $1 
       ORDER BY recorded_at ASC 
       LIMIT 30`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mood data' });
  }
});

// Add family member
router.post('/family', checkAuth, async (req, res) => {
  const { name, email, phone, relationship } = req.body;
  try {
    await db.query(
      `INSERT INTO family_members (senior_id, name, email, phone, relationship) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.userId, name, email, phone, relationship]
    );
    res.json({ success: true, message: 'Family member added' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add family member' });
  }
});

// Get family members
router.get('/family', checkAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, phone, relationship, notify_email 
       FROM family_members 
       WHERE senior_id = $1`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch family members' });
  }
});

// Emergency alert endpoint
router.post('/emergency-alert', checkAuth, async (req, res) => {
  const { message } = req.body;
  try {
    // Save alert
    await db.query(
      `INSERT INTO emergency_alerts (senior_id, alert_type, message) 
       VALUES ($1, $2, $3)`,
      [req.user.userId, 'EMERGENCY', message]
    );
    
    // Send email to family
    const familyResult = await db.query(
      `SELECT email FROM family_members WHERE senior_id = $1 AND notify_email = true`,
      [req.user.userId]
    );
    
    for (const family of familyResult.rows) {
      await sendEmergencyAlert(family.email, req.user.name || 'Senior', message);
    }
    
    res.json({ success: true, message: 'Emergency alert sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send alert' });
  }
});

module.exports = router;


