const { getSheetsClient } = require('../_sheets-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sheetName, rowData } = req.body;
  if (!sheetName || !rowData) return res.status(400).json({ error: 'sheetName and rowData required' });
  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowData] },
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sheets append error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
