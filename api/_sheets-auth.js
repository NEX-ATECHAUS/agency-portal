// Shared Google auth helper using OAuth2 (no service account key needed)
const { google } = require('googleapis');

function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return oauth2Client;
}

function getSheetsClient() {
  const auth = getOAuthClient();
  return google.sheets({ version: 'v4', auth });
}

module.exports = { getOAuthClient, getSheetsClient };
