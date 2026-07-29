const axios = require('axios');

// Using a simple email API - you can replace with SendGrid, AWS SES, etc.
async function sendEmail(to, subject, body) {
  console.log(`📧 EMAIL TO ${to}:`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${body.substring(0, 200)}...`);
  
  // Placeholder - integrate with your email provider
  // Example with SendGrid:
  // await axios.post('https://api.sendgrid.com/v3/mail/send', {...}, {headers: {Authorization: `Bearer ${process.env.SENDGRID_KEY}`}});
  
  return { success: true, message: 'Email logged (integrate SendGrid/AWS SES for production)' };
}

async function sendCheckInSummary(familyEmail, seniorName, summary, mood, medTaken, checkinDate) {
  const moodEmoji = mood >= 4 ? '😊' : mood >= 3 ? '😐' : mood >= 2 ? '😟' : '😢';
  const medStatus = medTaken === true ? '✅ Yes' : medTaken === false ? '❌ No' : '❓ Unknown';
  
  const subject = `Daily Check-In: ${seniorName} - ${new Date(checkinDate).toLocaleDateString()}`;
  const body = `
Hello,

${seniorName} completed their daily check-in.

${moodEmoji} Mood: ${mood}/5
💊 Medication Taken: ${medStatus}
📝 Summary: ${summary}

Log in to the dashboard to view full details.

---
Sent by Check-In Companion
`;

  return sendEmail(familyEmail, subject, body);
}

async function sendEmergencyAlert(familyEmail, seniorName, message) {
  const subject = `🚨 EMERGENCY ALERT: ${seniorName}`;
  const body = `
🚨 EMERGENCY ALERT 🚨

${seniorName} may need immediate help.

Message: ${message}

Please contact them or emergency services immediately.

---
Sent by Check-In Companion
`;

  return sendEmail(familyEmail, subject, body);
}

module.exports = { sendEmail, sendCheckInSummary, sendEmergencyAlert };
