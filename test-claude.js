const axios = require('axios');

const API_KEY = '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';

const MODELS = [
  'claude-sonnet-5-latest',
  'claude-sonnet-5-20250501',
  'claude-sonnet-5-20250601',
  'claude-5-sonnet-20250601',
  'claude-3-5-sonnet-20241022',
  'claude-3-sonnet-20240229',
  'claude-opus-5-latest',
  'claude-haiku-4-5-latest',
];

async function testModel(model) {
  try {
    await axios.post('https://api.anthropic.com/v1/messages', {
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
    return true;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.log(`❌ ${model}: [${status}] ${msg}`);
    return false;
  }
}

async function main() {
  console.log('Testing Claude API models...\n');
  for (const model of MODELS) {
    await testModel(model);
  }
  console.log('\nCopy the ✅ WORKING model name into your .env file');
}

main();