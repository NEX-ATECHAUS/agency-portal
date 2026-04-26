// api/sheets/update.js
const { google } = require('googleapis');

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sheetName, rowIndex, rowData } = req.body;

  if (!sheetName || !rowIndex || !rowData) {
    return res.status(400).json({ error: 'sheetName, rowIndex, and rowData required' });
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowIndex}:Z${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData],
      },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sheets update error:', err);
    return res.status(500).json({ error: err.message });
  }
};
