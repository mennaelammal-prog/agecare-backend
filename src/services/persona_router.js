const axios = require('axios');

const PERSONAS = {
  cheerful_companion: {
    name: 'Cheerful Companion',
    system: `You are Check-In Companion, a warm friend for a senior citizen.
Use simple words, short sentences, and occasional emojis.
Ask about their day, feelings, family, and health.
Be encouraging and positive. Keep responses to 1-3 sentences.
NEVER say you are an AI, a computer, or that you cannot do things.
NEVER tell stories unless asked. Focus on the senior's wellbeing.`
  },
  medical_monitor: {
    name: 'Medical Monitor',
    system: `You are Check-In Companion, a caring health assistant.
Ask clearly about medications, symptoms, sleep, and appetite.
Use gentle but direct questions. Remind about doctor appointments.
If they mention pain or dizziness, ask follow-up questions.
Keep responses to 1-3 sentences.`
  },
  emergency_detector: {
    name: 'Emergency Detector',
    system: `You are Check-In Companion. The senior may need emergency help.
Stay calm but urgent. Ask if they can call 911.
Ask if family is nearby. Keep them talking until help arrives.
Do NOT make small talk during emergencies.`
  }
};

function safeJsonParse(text) {
  try {
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    // Try to extract with regex
    const personaMatch = text.match(/"persona"\s*:\s*"(\w+)"/);
    const confMatch = text.match(/"confidence"\s*:\s*([\d.]+)/);
    if (personaMatch) {
      return {
        persona: personaMatch[1],
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
        reason: 'parsed from malformed JSON'
      };
    }
    return null;
  }
}

async function routePersona(messages, currentPersona = 'cheerful_companion') {
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
  
  // Fast-path emergency detection
  const emergencyWords = ['chest pain', 'heart attack', 'fallen', 'can\'t breathe', 'bleeding', 'unconscious', '911', 'emergency', 'hurt badly'];
  if (emergencyWords.some(w => lastMsg.includes(w))) {
    console.log('PERSONA: Forced emergency_detector');
    return { persona: 'emergency_detector', confidence: 1.0, reason: 'Emergency keywords detected' };
  }

  // Fast-path medical detection
  const medicalWords = ['medication', 'medicine', 'pill', 'doctor', 'pain', 'dizzy', 'sick', 'hospital', 'blood pressure', 'diabetes', 'insulin'];
  if (medicalWords.some(w => lastMsg.includes(w))) {
    console.log('PERSONA: Forced medical_monitor');
    return { persona: 'medical_monitor', confidence: 0.9, reason: 'Medical keywords detected' };
  }

  // Default to cheerful companion - skip LLM call for speed
  console.log('PERSONA: Default cheerful_companion');
  return { persona: 'cheerful_companion', confidence: 0.8, reason: 'Default wellness check-in' };
}

function getPersonaSystem(personaId) {
  return PERSONAS[personaId]?.system || PERSONAS.cheerful_companion.system;
}

module.exports = { routePersona, getPersonaSystem, PERSONAS };
