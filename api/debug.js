const { getSheetsClient } = require('./_sheets-auth');

module.exports = async (req, res) => {
  const results = {
    has_spreadsheet_id: !!process.env.SPREADSHEET_ID,
    has_service_account: !!process.env.GOOGLE_SERVICE_ACCOUNT,
    has_gmail_client_id: !!process.env.GMAIL_CLIENT_ID,
    has_gmail_client_secret: !!process.env.GMAIL_CLIENT_SECRET,
    has_gmail_refresh_token: !!process.env.GMAIL_REFRESH_TOKEN,
  };

  if (!process.env.SPREADSHEET_ID) {
    return res.status(200).json({ ...results, error: 'SPREADSHEET_ID not set' });
  }

  const hasOAuthConfig = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );

  if (!hasOAuthConfig && !process.env.GOOGLE_SERVICE_ACCOUNT) {
    return res.status(200).json({
      ...results,
      error: 'No Sheets auth configured. Set Gmail OAuth env vars or GOOGLE_SERVICE_ACCOUNT.',
    });
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
      results.service_account_json_parse = 'ok';
      results.has_private_key = !!credentials.private_key;
      results.has_client_email = !!credentials.client_email;
      results.private_key_has_escaped_newlines = credentials.private_key?.includes('\\n');
      results.private_key_has_real_newlines = credentials.private_key?.includes('\n');
    } catch (e) {
      results.service_account_json_parse = 'FAILED';
      results.service_account_json_error = e.message;
    }
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'settings',
    });
    results.auth = 'ok';
    results.auth_mode = hasOAuthConfig ? 'oauth' : 'service_account';
    results.read = 'ok';
    results.rows = response.data.values?.length || 0;
  } catch (e) {
    results.auth_or_read_error = e.message;
    results.error_code = e.code;
  }

  return res.status(200).json(results);
};
