/**
 * Agency Portal — Google Sheets Setup Script
 * 
 * Run once to create all required sheets and headers in your Google Spreadsheet.
 * 
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT='{"type":"service_account",...}' SPREADSHEET_ID='your-id' node scripts/setup-sheets.js
 */

const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT;

if (!SPREADSHEET_ID || !SERVICE_ACCOUNT) {
  console.error('❌  Missing env vars: SPREADSHEET_ID and GOOGLE_SERVICE_ACCOUNT are required.');
  process.exit(1);
}

const credentials = JSON.parse(SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Sheet name → column headers
const SHEETS = {
  clients: [
    'id', 'name', 'contact_name', 'email', 'phone', 'address',
    'city', 'state', 'country', 'website', 'notes', 'created_at',
  ],
  projects: [
    'id', 'title', 'client_id', 'client_name', 'type', 'status',
    'current_stage', 'stage_completion', 'total_fee', 'start_date',
    'end_date', 'description', 'proposal_id', 'created_at',
  ],
  proposals: [
    'id', 'title', 'client_id', 'client_name', 'client_email',
    'status', 'total_amount', 'payment_schedule', 'scope',
    'timeline', 'terms', 'valid_until', 'sent_at', 'accepted_at', 'created_at',
  ],
  invoices: [
    'id', 'invoice_number', 'project_id', 'client_id', 'client_name',
    'client_email', 'stage', 'stage_description', 'amount', 'status',
    'due_date', 'paid_at', 'sent_at', 'created_at',
  ],
  time_entries: [
    'id', 'project_id', 'project_title', 'stage', 'description',
    'hours', 'billable', 'team_member', 'date', 'created_at',
  ],
  expenses: [
    'id', 'description', 'category', 'amount', 'date',
    'receipt_url', 'project_id', 'notes', 'created_at',
  ],
  notifications: [
    'id', 'title', 'message', 'type', 'read', 'link', 'created_at',
  ],
  settings: [
    'key', 'value',
  ],
  users: [
    'id', 'name', 'email', 'role', 'created_at',
  ],
};

// Default settings rows
const DEFAULT_SETTINGS = [
  ['company_name', 'My Agency'],
  ['company_email', ''],
  ['company_phone', ''],
  ['company_address', ''],
  ['bank_bsb', ''],
  ['bank_account', ''],
  ['bank_name', ''],
  ['paypal_link', ''],
  ['stripe_link', ''],
  ['invoice_footer', 'Thank you for your business.'],
  ['payment_terms', 'Payment due within 30 days of invoice date.'],
  ['accent_color', '#6c63ff'],
];

async function run() {
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  // Get existing sheets
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets.map(s => s.properties.title);

  console.log(`\n📊  Spreadsheet: ${meta.data.properties.title}`);
  console.log(`   Existing sheets: ${existing.join(', ') || '(none)'}\n`);

  const requests = [];
  const toCreate = [];

  for (const sheetName of Object.keys(SHEETS)) {
    if (!existing.includes(sheetName)) {
      requests.push({ addSheet: { properties: { title: sheetName } } });
      toCreate.push(sheetName);
    }
  }

  // Create missing sheets
  if (requests.length > 0) {
    console.log(`➕  Creating sheets: ${toCreate.join(', ')}`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
  } else {
    console.log('✅  All sheets already exist.');
  }

  // Write headers to all sheets
  console.log('\n📝  Writing headers...');
  for (const [sheetName, headers] of Object.entries(SHEETS)) {
    const range = `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`   ✓ ${sheetName} (${headers.length} columns)`);
  }

  // Write default settings if settings sheet is empty
  const settingsData = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'settings!A2:B100',
  });

  if (!settingsData.data.values || settingsData.data.values.length === 0) {
    console.log('\n⚙️   Writing default settings...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'settings!A2',
      valueInputOption: 'RAW',
      requestBody: { values: DEFAULT_SETTINGS },
    });
    console.log(`   ✓ ${DEFAULT_SETTINGS.length} default settings written`);
  } else {
    console.log('\n⚙️   Settings already populated — skipping defaults.');
  }

  console.log('\n🎉  Setup complete! Your Google Sheet is ready.\n');
  console.log('Next steps:');
  console.log('  1. Share the spreadsheet with your service account email (Editor access)');
  console.log('  2. Copy the Spreadsheet ID from the URL');
  console.log('  3. Add all env vars to your Vercel project (see README.md)\n');
}

run().catch(err => {
  console.error('\n❌  Setup failed:', err.message);
  process.exit(1);
});
