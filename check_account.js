require('dotenv').config();
const axios = require('axios');

async function checkAccount() {
  try {
    const res = await axios.get('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });
    console.log('Available models:', res.data.data.map(m => m.id).join(', '));
  } catch (err) {
    console.error('Status:', err.response?.status);
    console.error('Type:', err.response?.data?.error?.type);
    console.error('Message:', err.response?.data?.error?.message);
  }
}

checkAccount();
