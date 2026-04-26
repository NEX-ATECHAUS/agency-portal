const { google } = require('googleapis');

async function getSheetsClient() {
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT env var is not valid JSON: ' + e.message);
  }

  // Fix escaped newlines in private key (common Vercel env var issue)
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sheetName = req.method === 'GET' ? req.query.sheetName : req.body?.sheetName;

  if (!sheetName) {
    return res.status(400).json({ error: 'Missing sheetName' });
  }

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    return res.status(500).json({ error: 'SPREADSHEET_ID env var not set' });
  }

  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    });
    return res.status(200).json({ values: response.data.values || [] });
  } catch (err) {
    console.error('Sheets read error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to read sheet' });
  }
};
