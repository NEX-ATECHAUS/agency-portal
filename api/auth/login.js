// api/auth/login.js
// Vercel serverless function for admin authentication
const { google } = require('googleapis');

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Check against ADMIN credentials stored in env vars
  // For simplicity: compare against env var ADMIN_EMAIL and ADMIN_PASSWORD
  // In production you'd hash the password
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'Admin';

  if (!adminEmail || !adminPassword) {
    return res.status(500).json({ error: 'Auth not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars.' });
  }

  if (email.toLowerCase() !== adminEmail.toLowerCase() || password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  return res.status(200).json({
    user: {
      id: '1',
      email: adminEmail,
      name: adminName,
      role: 'admin',
    },
  });
};
