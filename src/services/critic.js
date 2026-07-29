const axios = require('axios');

function safeJsonParse(text) {
  try {
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    const scoreMatch = text.match(/"score"\s*:\s*(\d+)/);
    const issueMatch = text.match(/"issue"\s*:\s*"([^"]*)"/);
    const rewrittenMatch = text.match(/"rewritten"\s*:\s*"([^"]*)"/);
    
    if (scoreMatch) {
      return {
        score: parseInt(scoreMatch[1]),
        issue: issueMatch ? issueMatch[1] : 'parse error',
        rewritten: rewrittenMatch ? rewrittenMatch[1] : null
      };
    }
    return null;
  }
}

async function criticRevise(content, context = 'senior_chat') {
  // Skip critic for short responses to save API calls
  if (content.length < 50) {
    return content;
  }

  const safeContent = content.replace(/"/g, "'").substring(0, 300);

  const critiquePrompt = `Rate this senior care response 1-10 for clarity, warmth, simplicity.
If score is below 6, provide a rewritten version that is simpler and warmer.
If score is 6 or above, set rewritten to null.

Response: ${safeContent}

Output ONLY valid JSON (no markdown, no quotes inside strings):
{score:8,issue:none,rewritten:null}`;

  try {
    const result = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-5',
      max_tokens: 200,
      messages: [{ role: 'user', content: critiquePrompt }],
    }, {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
    });

    let text = result.data.content.find(c => c.type === 'text')?.text || '{}';
    const critique = safeJsonParse(text);

    if (!critique || typeof critique.score !== 'number') {
      console.log('Critic: Parse failed, using original');
      return content;
    }

    if (critique.score < 6 && critique.rewritten && critique.rewritten.length > 10 && critique.rewritten !== 'null') {
      console.log(`Critic: Score ${critique.score}/10, rewriting`);
      return critique.rewritten;
    }

    console.log(`Critic: Score ${critique.score}/10, no changes`);
    return content;
  } catch (err) {
    console.error('Critic error:', err.message);
    return content;
  }
}

module.exports = { criticRevise };
