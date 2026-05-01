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

function getServiceAccountAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  const hasOAuthConfig = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );

  let auth;
  if (hasOAuthConfig) {
    auth = getOAuthClient();
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    auth = getServiceAccountAuth();
  } else {
    throw new Error('Missing Sheets auth. Set Gmail OAuth env vars or GOOGLE_SERVICE_ACCOUNT.');
  }

  return google.sheets({ version: 'v4', auth });
}

module.exports = { getOAuthClient, getServiceAccountAuth, getSheetsClient };
