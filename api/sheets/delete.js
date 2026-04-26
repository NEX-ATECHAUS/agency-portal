const { getSheetsClient } = require('../_sheets-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sheetName, rowIndex } = req.body;
  if (!sheetName || !rowIndex) return res.status(400).json({ error: 'sheetName and rowIndex required' });
  try {
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: process.env.SPREADSHEET_ID });
    const sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) return res.status(404).json({ error: `Sheet "${sheetName}" not found` });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        }],
      },
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sheets delete error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
