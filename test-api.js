const axios = require('axios');

const API_KEY = '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';

const MODELS = [
  'claude-3-5-sonnet-latest',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
];

async function testModel(model) {
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }],
    }, {
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 10000,
    });
    console.log(`✅ WORKS: ${model}`);
    console.log('Response:', response.data.content[0]?.text?.slice(0, 50));
    return true;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.log(`❌ ${model}: [${status}] ${msg}`);
    return false;
  }
}

async function main() {
  console.log('Testing Claude API...\n');
  for (const model of MODELS) {
    const works = await testModel(model);
    if (works) break;
  }
}

main();