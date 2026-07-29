const axios = require('axios');
const { KnowledgeGraph } = require('./knowledge_graph');
const { routePersona, getPersonaSystem } = require('./persona_router');
const { ReflexionStore } = require('./reflexion');
const { TriadSafetyChecker } = require('./triad');
const { criticRevise } = require('./critic');

async function getClaudeResponse(messages, seniorId = null) {
  const triad = new TriadSafetyChecker();
  const safetyResult = await triad.run(messages);
  
  if (safetyResult.alert && safetyResult.alertType === 'EMERGENCY') {
    console.log('TRIAD: EMERGENCY DETECTED');
    return `🚨 ${safetyResult.actionNeeded} Please call 911 or your emergency contact right now. I'm staying with you.`;
  }

  const kg = seniorId ? new KnowledgeGraph(seniorId) : null;
  const factsText = kg ? await kg.formatForPrompt() : '';

  const reflexion = seniorId ? new ReflexionStore(seniorId) : null;
  const lessonsText = reflexion ? await reflexion.formatForPrompt('chat_response') : '';

  const personaDecision = await routePersona(messages);
  const systemPrompt = getPersonaSystem(personaDecision.persona);

  let context = systemPrompt;
  if (factsText) context += `\n\nKnown facts:\n${factsText}`;
  if (lessonsText) context += `\n\nLessons learned:\n${lessonsText}`;
  if (safetyResult.followUpQuestion) context += `\n\nImportant follow-up: ${safetyResult.followUpQuestion}`;

  const claudeMessages = [
    { role: 'user', content: context + '\n\nNow respond to the senior as Check-In Companion. Keep it to 1-3 sentences.' }
  ];

  for (const msg of messages) {
    claudeMessages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    });
  }

  try {
    console.log('Calling Claude, persona:', personaDecision.persona);
    const result = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-5',
      max_tokens: 100,
      messages: claudeMessages,
    }, {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
    });

    let responseText = result.data.content.find(c => c.type === 'text')?.text || 'No response.';
    responseText = await criticRevise(responseText);
    
    console.log('Response:', responseText.substring(0, 80));
    return responseText;
  } catch (error) {
    console.error('Claude error:', error.message);
    return "I'm sorry, I'm having trouble right now. Please try again.";
  }
}

async function summarizeConversation(conversationHistory, seniorId = null) {
  if (seniorId) {
    const kg = new KnowledgeGraph(seniorId);
    await kg.extractFromConversation(conversationHistory);
  }

  const messages = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  
  const prompt = `Analyze this senior check-in conversation.
CRITICAL: Determine if the senior EXPLICITLY confirmed taking medication today. 
Only answer "yes" if they clearly said they took it. Answer "no" if they said they didn't. Otherwise "unknown".

Output ONLY valid JSON:
{"summary":"one sentence about their wellbeing","mood":3,"medTaken":"yes"}

Conversation:
${messages}`;

  if (!process.env.CLAUDE_API_KEY) {
    return { summary: 'API key missing', mood: null, medTaken: null };
  }

  try {
    const result = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
    });

    let text = result.data.content.find(c => c.type === 'text')?.text || '{}';
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const parsed = JSON.parse(text);
    
    let medTaken = null;
    if (parsed.medTaken === 'yes' || parsed.medTaken === true) medTaken = true;
    else if (parsed.medTaken === 'no' || parsed.medTaken === false) medTaken = false;
    
    return {
      summary: parsed.summary || 'Summary unavailable',
      mood: (parsed.mood >= 1 && parsed.mood <= 5) ? parsed.mood : null,
      medTaken: medTaken,
    };
  } catch (error) {
    console.error('Summary error:', error.message);
    return { summary: 'Could not generate', mood: null, medTaken: null };
  }
}

module.exports = { getClaudeResponse, summarizeConversation };

