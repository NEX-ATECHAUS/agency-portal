const { google } = require('googleapis');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sheetName = req.method === 'GET' ? req.query.sheetName : req.body.sheetName;

  if (!sheetName) {
    return res.status(400).json({ error: 'Missing sheetName' });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: sheetName,
    });

    return res.status(200).json({ values: response.data.values || [] });
  } catch (err) {
    console.error('Read error:', err);
    return res.status(500).json({ error: err.message || 'Failed to read sheet' });
  }
};
