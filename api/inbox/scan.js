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
      content: `Parse this invoice/receipt email into a structured expense. Return ONLY valid JSON, no markdown, no explanation.

Subject: ${subject}
From: ${sender}
Date: ${date}
Body: ${body.substring(0, 2000)}

JSON:
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

function extractBody(payload) {
  let body = '';
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      body += Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }
    if (part.parts) part.parts.forEach(walk);
  };
  walk(payload);
  return body;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    const sheets = getSheetsClient();

    // Calculate days ago from the provided from date
    const fromDate = req.body?.from ? new Date(req.body.from) : new Date(Date.now() - 90 * 86400000);
    const daysAgo = Math.ceil((Date.now() - fromDate.getTime()) / 86400000);
    const newerThan = `${daysAgo}d`;

    console.log(`Scanning inbox: newer_than:${newerThan} (from ${fromDate.toISOString()})`);

    // Run two separate simple searches and merge results
    const queries = [
      `subject:invoice newer_than:${newerThan} -from:accounts@nchhair.com -subject:TEST`,
      `subject:receipt newer_than:${newerThan} -subject:TEST`,
      `from:invoice+statements@mail.anthropic.com newer_than:${newerThan}`,
      `from:billing newer_than:${newerThan}`,
      `"tax invoice" newer_than:${newerThan}`,
    ];

    const threadIds = new Set();
    for (const q of queries) {
      try {
        const r = await gmail.users.threads.list({ userId: 'me', q, maxResults: 50 });
        (r.data.threads || []).forEach(t => threadIds.add(t.id));
      } catch (e) {
        console.error('Query failed:', q, e.message);
      }
    }

    console.log(`Found ${threadIds.size} unique threads`);

    if (!threadIds.size) {
      return res.status(200).json({
        added: 0, skipped: 0,
        threads_found: 0,
        message: 'No invoice emails found — check Vercel logs for details',
      });
    }

    // Get existing to avoid duplicates
    const existingRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'expenses!A:Z',
    }).catch(() => ({ data: { values: [] } }));
    const existingNotes = (existingRows.data.values || []).slice(1).map(r => r[7] || '').join(' ');

    const added = [];
    const skipped = [];

    // Exclude our own sent emails and known noise
    const skipSenders = ['hello@nex-a.com.au', 'sean@nex-a.com.au', 'notifications@vercel.com', 'noreply@', 'no-reply@'];

    for (const threadId of threadIds) {
      try {
        const threadData = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
        const msg = threadData.data.messages?.[0];
        if (!msg) continue;

        const msgId = msg.id;
        if (existingNotes.includes(msgId)) { skipped.push(`dup:${msgId}`); continue; }

        const headers = msg.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const sender  = headers.find(h => h.name === 'From')?.value || '';
        const dateStr = headers.find(h => h.name === 'Date')?.value || '';
        const date    = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        // Skip our own sent emails and noise
        if (skipSenders.some(s => sender.toLowerCase().includes(s))) { skipped.push(`own:${subject}`); continue; }
        if (subject.toLowerCase().includes('test') || subject.toLowerCase().includes('share request') ||
            subject.toLowerCase().includes('canceled') || subject.toLowerCase().includes('appointment')) {
          skipped.push(`noise:${subject}`); continue;
        }

        const body = extractBody(msg.payload);
        if (!body.trim()) { skipped.push(`nobody:${subject}`); continue; }

        // AI parse
        const parsed = await parseInvoiceWithAI(subject, sender, date, body);
        const amount = parseFloat(parsed.amount);
        if (!amount || amount <= 0 || amount > 100000) {
          skipped.push(`noamt:${subject} (${parsed.amount})`); continue;
        }

        // Write to expenses
        const row = [
          generateId(),
          parsed.description,
          parsed.category,
          String(amount.toFixed(2)),
          date,
          '',
          '',
          `${parsed.notes || ''} | Vendor: ${parsed.vendor || ''} | email:${msgId}`,
          new Date().toISOString(),
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: 'expenses!A:Z',
          valueInputOption: 'RAW',
          requestBody: { values: [row] },
        });

        added.push({ description: parsed.description, category: parsed.category, amount: String(amount.toFixed(2)), date, vendor: parsed.vendor });
        await new Promise(r => setTimeout(r, 300));

      } catch (e) {
        console.error('Thread error:', threadId, e.message);
        skipped.push(`err:${threadId}:${e.message}`);
      }
    }

    console.log(`Done: ${added.length} added, ${skipped.length} skipped`);
    console.log('Skipped:', skipped);

    return res.status(200).json({
      success: true,
      added: added.length,
      skipped: skipped.length,
      threads_found: threadIds.size,
      expenses: added,
    });

  } catch (err) {
    console.error('Scan error:', err.message, err.stack);
    return res.status(500).json({ error: err.message, details: err.code });
  }
};
