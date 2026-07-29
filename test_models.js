require('dotenv').config();
const axios = require('axios');

const models = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-latest',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-3-opus-20240229'
];

async function testModels() {
  for (const model of models) {
    try {
      const res = await axios.post('https://api.anthropic.com/v1/messages', {
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say hi' }]
      }, {
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      });
      console.log('✅ WORKS:', model, '->', res.data.content[0].text);
      break;
    } catch (err) {
      console.log('❌ FAILED:', model, '->', err.response?.data?.error?.message || err.message);
    }
  }
}

testModels();
