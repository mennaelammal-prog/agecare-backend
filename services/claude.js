const axios = require('axios');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_VERSION = '2023-06-01';

function detectSeriousConcern(message) {
  const seriousKeywords = [
    'chest pain', 'heart attack', 'stroke', 'can\'t breathe', 'difficulty breathing',
    'severe pain', 'unconscious', 'bleeding', 'emergency', '911', 'ambulance',
    'fallen', 'fall', 'broke', 'broken bone', 'head injury', 'dizzy', 'fainting',
    'chest', 'heart', 'breathing', 'swelling', 'numbness', 'paralyzed',
  ];
  
  const lowerMsg = message.toLowerCase();
  return seriousKeywords.some(keyword => lowerMsg.includes(keyword));
}

function getMockResponse(message, type = 'chat', context = {}) {
  const lowerMsg = message.toLowerCase();
  const { mood, energy, pain, sleep_hours, notes } = context;

  // === CHECK-IN RESPONSES ===
  if (type === 'checkin') {
    let response = '';

    // Sleep analysis
    if (sleep_hours !== null && sleep_hours !== undefined) {
      if (sleep_hours < 5) {
        response += `I notice you only got ${sleep_hours} hours of sleep last night. That's quite low — poor sleep can affect your mood, energy, and overall health. Try to aim for 7-8 hours. Consider a short nap today and talk to your doctor if insomnia continues.\n\n`;
      } else if (sleep_hours > 10) {
        response += `You slept ${sleep_hours} hours, which is more than usual. While rest is good, oversleeping can sometimes leave you feeling groggy. See how your energy feels today and try to maintain a consistent sleep schedule.\n\n`;
      } else if (sleep_hours >= 7 && sleep_hours <= 9) {
        response += `Great job getting ${sleep_hours} hours of sleep! That's in the healthy range for seniors. Good sleep supports your immune system, memory, and mood.\n\n`;
      } else {
        response += `You got ${sleep_hours} hours of sleep. Everyone's needs are different, but most adults do best with 7-9 hours. Keep tracking this to see what works for you.\n\n`;
      }
    }

    // High pain check-in
    if (pain >= 7) {
      response += `I see you're experiencing significant pain today (${pain}/10). Please take your prescribed pain medication if you haven't already, rest, and consider contacting your doctor if this continues. Your family has been notified.`;
      return response.trim();
    }
    
    // Low mood check-in
    if (mood <= 2) {
      response += `I notice you're not feeling your best today. That's okay — everyone has difficult days. Try to do something gentle that brings you comfort, and don't hesitate to reach out to family or your doctor if you need support.`;
      return response.trim();
    }
    
    // Good check-in
    if (mood >= 4 && pain <= 2) {
      response += `Great to hear you're doing well today! Keep up with your healthy routines — stay hydrated, take your medications on time, and enjoy some gentle activity. Keep up the good work!`;
      return response.trim();
    }
    
    // Default check-in response
    response += `Thank you for checking in today. I've recorded your responses and your family will be notified. Remember to stay consistent with your routines and reach out if you need anything. Take care!`;
    return response.trim();
  }

  // === CHAT RESPONSES ===
  
  if (detectSeriousConcern(message)) {
    return `⚠️ IMPORTANT: I notice you mentioned something serious (${message}). 

This could be a medical emergency. Please:
1. Call your doctor immediately
2. If symptoms are severe, call emergency services (911)
3. Do not wait - seek professional medical help now

I am an AI assistant and cannot diagnose or treat medical conditions. Your safety is the top priority.`;
  }

  if ((lowerMsg.includes('pain') || lowerMsg.includes('hurt') || lowerMsg.includes('ache')) && type === 'chat') {
    return `I'm sorry to hear you're experiencing pain. 

For elderly care, it's important to:
- Note the exact location and intensity (1-10)
- Check if it's new or recurring
- Consider if medications were taken on time
- Contact your doctor if pain persists or worsens

Would you like help tracking this in your daily check-in?`;
  }

  if (lowerMsg.includes('sleep') || lowerMsg.includes('tired') || lowerMsg.includes('insomnia')) {
    return `Sleep is very important for your health. 

Tips for better sleep:
- Maintain a regular bedtime routine
- Avoid caffeine after 2 PM
- Keep the bedroom cool and dark
- Consider discussing sleep issues with your doctor

How many hours of sleep have you been getting?`;
  }

  if (lowerMsg.includes('sad') || lowerMsg.includes('lonely') || lowerMsg.includes('depressed')) {
    return `I'm here for you. Feeling down is completely valid, and it's good that you're sharing this.

Please remember:
- Talk to a family member or friend
- Your doctor can help with mental health support
- Regular social contact is important for wellbeing
- You're not alone - help is available

Would you like me to help you reach out to a family contact?`;
  }

  if (lowerMsg.includes('medicine') || lowerMsg.includes('medication') || lowerMsg.includes('pill')) {
    return `Staying on track with medications is crucial. 

Tips:
- Use a pill organizer
- Set daily reminders
- Take medications at the same time each day
- Keep a list of all medications for doctor visits

Have you taken your medications today?`;
  }

  const generalResponses = [
    `Thank you for sharing that with me. It's important to monitor how you're feeling daily. Keep up with your check-ins, and don't hesitate to reach out to family or your doctor if anything changes.`,
    `I appreciate you telling me that. For elderly care, consistency in daily routines really helps. Make sure you're staying hydrated and getting some gentle movement when possible.`,
    `That's good to know. Remember to track these things in your daily check-in so your family can stay informed about your wellbeing.`,
    `I'm glad you're engaging with your health. Small daily habits make a big difference over time. Is there anything specific you'd like help with today?`,
  ];

  return generalResponses[Math.floor(Math.random() * generalResponses.length)];
}

function extractText(responseData) {
  try {
    if (responseData?.content && Array.isArray(responseData.content)) {
      const textBlocks = responseData.content
        .filter(block => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text);
      if (textBlocks.length > 0) return textBlocks.join('\n');
    }
    if (responseData?.content?.text) return responseData.content.text;
    if (typeof responseData?.text === 'string') return responseData.text;
    return '';
  } catch (err) {
    return '';
  }
}

async function askClaude({ messages, system, maxTokens = 1024, temperature = 0.7 }) {
  // ANTHROPIC_API_KEY is the standard name Anthropic's own docs use; accept
  // it as well as CLAUDE_API_KEY so setting the more conventional name
  // doesn't silently fall back to mock responses (confirmed happening in
  // production: the key was set as ANTHROPIC_API_KEY, CLAUDE_API_KEY was
  // never read, so every chat request used the canned fallback with no
  // error or warning of any kind).
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const useMock = !apiKey || apiKey.includes('your-key') || apiKey.includes('placeholder');

  const lastMsg = messages[messages.length - 1]?.content || '';
  
  const isCheckin = lastMsg.includes('Daily check-in:') && lastMsg.includes('Mood:');
  
  let context = {};
  if (isCheckin) {
    const moodMatch = lastMsg.match(/Mood:\s*(\d+)/);
    const energyMatch = lastMsg.match(/Energy:\s*(\d+)/);
    const painMatch = lastMsg.match(/Pain:\s*(\d+)/);
    const sleepMatch = lastMsg.match(/Sleep:\s*([\d.]+)/);
    const notesMatch = lastMsg.match(/Notes:\s*(.+)/);
    
    context = {
      mood: moodMatch ? parseInt(moodMatch[1]) : 3,
      energy: energyMatch ? parseInt(energyMatch[1]) : 3,
      pain: painMatch ? parseInt(painMatch[1]) : 0,
      sleep_hours: sleepMatch ? parseFloat(sleepMatch[1]) : null,
      notes: notesMatch ? notesMatch[1].trim() : '',
    };
  }

  if (useMock) {
    return {
      text: getMockResponse(lastMsg, isCheckin ? 'checkin' : 'chat', context),
      usage: { input_tokens: 10, output_tokens: 20 },
      model: 'mock-claude-smart',
      stopReason: 'end_turn',
    };
  }

  const payload = {
    // claude-3-5-sonnet-20241022 has been retired -- confirmed in production
    // logs, Anthropic's API now returns 404 for it. claude-sonnet-5 is the
    // current model in this line as of this fix.
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    max_tokens: maxTokens,
    // temperature deliberately omitted: also confirmed in production logs,
    // the API rejects it outright for this model ("`temperature` is
    // deprecated for this model", 400). The temperature parameter/default
    // is kept on this function's signature for callers, just not forwarded.
    messages,
  };
  if (system) payload.system = system;

  try {
    const response = await axios.post(CLAUDE_API_URL, payload, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': CLAUDE_API_VERSION,
        'content-type': 'application/json',
      },
      timeout: 30000,
    });

    const text = extractText(response.data);
    if (!text) throw new Error('No response text found');

    return {
      text,
      usage: response.data.usage || {},
      model: response.data.model,
      stopReason: response.data.stop_reason,
    };
  } catch (err) {
    console.error('[Claude] API error:', err.response?.status, err.response?.data?.error?.message || err.message);
    return {
      text: getMockResponse(lastMsg, isCheckin ? 'checkin' : 'chat', context),
      usage: { input_tokens: 10, output_tokens: 20 },
      model: 'mock-claude-fallback',
      stopReason: 'end_turn',
    };
  }
}

async function* streamClaude({ messages, system, maxTokens = 1024, temperature = 0.7 }) {
  const result = await askClaude({ messages, system, maxTokens, temperature });
  yield { type: 'text', text: result.text };
  yield { type: 'done', usage: result.usage };
}

module.exports = { askClaude, streamClaude, extractText, detectSeriousConcern };