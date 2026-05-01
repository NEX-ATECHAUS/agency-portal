const { google } = require('googleapis');
const { getOAuthClient, getSheetsClient } = require('../_sheets-auth');
const Anthropic = require('@anthropic-ai/sdk');

function generateId() {
  return 'EXP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

async function parseInvoiceWithAI(subject, sender, date, body) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Parse this invoice/receipt email into a structured expense. Return ONLY valid JSON, no markdown.

Subject: ${subject}
From: ${sender}
Date: ${date}
Body: ${body.substring(0, 1500)}

Return this exact JSON shape:
{
  "description": "clear short description of what was purchased",
  "category": "one of: Software, Subscriptions, Marketing, Hardware, Travel, Office, Contractor, Food, Other",
  "amount": "numeric AUD amount as string e.g. 16.50",
  "vendor": "company/vendor name",
  "notes": "invoice or receipt number if present"
}`
    }]
  });

  const text = msg.content[0].text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

async function getAlreadyProcessed(sheets) {
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'expenses',
    });
    const rows = r.data.values || [];
    // Collect all notes fields (col I index 8) to check for email IDs
    return new Set(rows.slice(1).map(r => r[8] || '').join(' '));
  } catch { return new Set(); }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    const sheets = getSheetsClient();

    // Search for invoice/receipt emails in the last 90 days
    const searchRes = await gmail.users.threads.list({
      userId: 'me',
      q: 'subject:(invoice OR receipt OR "tax invoice" OR "payment confirmation") to:hello@nex-a.com.au newer_than:90d -from:hello@nex-a.com.au -from:accounts@nchhair.com -subject:TEST -subject:"share request"',
      maxResults: 50,
    });

    const threads = searchRes.data.threads || [];
    if (!threads.length) return res.status(200).json({ added: 0, message: 'No new invoices found' });

    // Get existing expenses to avoid duplicates
    const existingRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'expenses',
    }).catch(() => ({ data: { values: [] } }));

    const existingNotes = (existingRows.data.values || []).slice(1).map(r => r[7] || '').join(' ');

    const added = [];
    const skipped = [];

    for (const thread of threads) {
      try {
        const threadData = await gmail.users.threads.get({
          userId: 'me',
          id: thread.id,
          format: 'full',
        });

        const msg = threadData.data.messages?.[0];
        if (!msg) continue;

        const msgId = msg.id;

        // Skip if already processed
        if (existingNotes.includes(msgId)) {
          skipped.push(msgId);
          continue;
        }

        const headers = msg.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const sender  = headers.find(h => h.name === 'From')?.value || '';
        const dateStr = headers.find(h => h.name === 'Date')?.value || '';
        const date    = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        // Extract body text
        let body = '';
        const extractText = (part) => {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
          if (part.parts) part.parts.forEach(extractText);
        };
        if (msg.payload) extractText(msg.payload);

        if (!body.trim()) { skipped.push(subject); continue; }

        // Use AI to parse
        const parsed = await parseInvoiceWithAI(subject, sender, date, body);

        // Validate amount
        const amount = parseFloat(parsed.amount);
        if (!amount || amount <= 0 || amount > 100000) {
          skipped.push(`${subject} (invalid amount: ${parsed.amount})`);
          continue;
        }

        // Write to expenses sheet
        // Schema: id, description, category, amount, date, receipt_url, project_id, notes, created_at
        const row = [
          generateId(),
          parsed.description,
          parsed.category,
          parsed.amount,
          date,
          '',
          '',
          `${parsed.notes || ''} | Vendor: ${parsed.vendor || ''} | email:${msgId}`,
          new Date().toISOString(),
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: 'expenses',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [row] },
        });

        added.push({ description: parsed.description, category: parsed.category, amount: parsed.amount, date, vendor: parsed.vendor });

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 300));

      } catch (threadErr) {
        console.error('Thread error:', threadErr.message);
        skipped.push(thread.id);
      }
    }

    return res.status(200).json({
      success: true,
      added: added.length,
      skipped: skipped.length,
      expenses: added,
    });

  } catch (err) {
    console.error('Inbox scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
