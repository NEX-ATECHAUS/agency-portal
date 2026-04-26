const { getSheetsClient } = require('../_sheets-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const sheetName = req.method === 'GET' ? req.query.sheetName : req.body?.sheetName;
  if (!sheetName) return res.status(400).json({ error: 'Missing sheetName' });
  if (!process.env.SPREADSHEET_ID) return res.status(500).json({ error: 'SPREADSHEET_ID not set' });
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: sheetName,
    });
    return res.status(200).json({ values: response.data.values || [] });
  } catch (err) {
    console.error('Sheets read error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
