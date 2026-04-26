module.exports = async (req, res) => {
  const results = {};

  // 1. Check env vars exist
  results.has_spreadsheet_id = !!process.env.SPREADSHEET_ID;
  results.has_service_account = !!process.env.GOOGLE_SERVICE_ACCOUNT;

  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    return res.status(200).json({ ...results, error: 'GOOGLE_SERVICE_ACCOUNT not set' });
  }

  // 2. Try parsing the JSON
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    results.json_parse = 'ok';
    results.has_private_key = !!credentials.private_key;
    results.has_client_email = !!credentials.client_email;
    results.private_key_starts = credentials.private_key?.substring(0, 40);
    results.private_key_has_escaped_newlines = credentials.private_key?.includes('\\n');
    results.private_key_has_real_newlines = credentials.private_key?.includes('\n');
  } catch (e) {
    return res.status(200).json({ ...results, json_parse: 'FAILED', json_error: e.message });
  }

  // 3. Try auth
  try {
    const { google } = require('googleapis');
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();
    results.auth = 'ok';

    // 4. Try reading
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'settings',
    });
    results.read = 'ok';
    results.rows = response.data.values?.length || 0;
  } catch (e) {
    results.auth_or_read_error = e.message;
    results.error_code = e.code;
  }

  return res.status(200).json(results);
};
