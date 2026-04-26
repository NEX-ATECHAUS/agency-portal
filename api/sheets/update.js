const { google } = require('googleapis');

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sheetName, rowIndex, rowData } = req.body;
  if (!sheetName || !rowIndex || !rowData) return res.status(400).json({ error: 'sheetName, rowIndex and rowData required' });
  try {
    const sheets = await getSheetsClient();
    const colLetter = String.fromCharCode(64 + rowData.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A${rowIndex}:${colLetter}${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sheets update error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
