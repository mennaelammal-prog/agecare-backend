require('dotenv').config();
const axios = require('axios');

async function testKey() {
  console.log('Key loaded:', !!process.env.CLAUDE_API_KEY);
  console.log('Key length:', process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.length : 0);
  
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say hello' }]
    }, {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });
    console.log('SUCCESS! Response:', res.data.content[0].text);
  } catch (err) {
    console.error('ERROR:', err.response?.status, err.response?.data?.error?.message || err.message);
  }
}

testKey();
