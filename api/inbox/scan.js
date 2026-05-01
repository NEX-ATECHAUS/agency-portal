const { google } = require('googleapis');
const { getOAuthClient, getSheetsClient } = require('../_sheets-auth');
const Anthropic = require('@anthropic-ai/sdk');

function generateId() {
  return 'EXP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function extractBody(payload) {
  let body = '';
  const walk = (part) => {
    if (!part) return;
    if ((part.mimeType === 'text/plain' || part.mimeType === 'text/html') && part.body?.data) {
      const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
      // Strip HTML tags if HTML
      body += part.mimeType === 'text/html'
        ? decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
        : decoded;
    }
    if (part.parts) part.parts.forEach(walk);
  };
  walk(payload);
  return body.trim();
}

async function classifyAndParse(subject, sender, date, body) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are reviewing an email to determine if it is a business expense (an invoice, receipt, or statement for something that was paid or is owed by the recipient).

Subject: ${subject}
From: ${sender}
Date: ${date}
Body excerpt:
${body.substring(0, 2500)}

First decide: is this a real business expense the recipient needs to pay or already paid?
- YES if: it's a receipt, invoice, or bill for software, services, subscriptions, hardware, contractors, or any business purchase
- NO if: it's a notification, reminder about someone else's invoice, appointment, test email, marketing, or outgoing invoice the recipient sent to their own clients

Return ONLY valid JSON, no markdown:
{
  "is_expense": true or false,
  "reason": "one sentence explanation",
  "description": "clear short description of what was purchased (only if is_expense is true)",
  "category": "one of: Software, Subscriptions, Marketing, Hardware, Travel, Office, Contractor, Food, Other (only if is_expense is true)",
  "amount": "numeric amount as string e.g. 16.50 (only if is_expense is true, null if not found)",
  "vendor": "company name (only if is_expense is true)",
  "notes": "invoice or receipt number if found (only if is_expense is true)"
}`
    }]
  });

  const text = msg.content[0].text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    const sheets = getSheetsClient();

    const fromDate = req.body?.from ? new Date(req.body.from) : new Date(Date.now() - 90 * 86400000);
    const daysAgo = Math.max(1, Math.ceil((Date.now() - fromDate.getTime()) / 86400000));

    console.log(`Scanning inbox newer_than:${daysAgo}d`);

    // Simple broad search — subject contains invoice OR statement OR receipt
    const threadIds = new Set();
    const queries = [
      `subject:invoice newer_than:${daysAgo}d`,
      `subject:statement newer_than:${daysAgo}d`,
      `subject:receipt newer_than:${daysAgo}d`,
    ];

    for (const q of queries) {
      try {
        const r = await gmail.users.threads.list({ userId: 'me', q, maxResults: 50 });
        (r.data.threads || []).forEach(t => threadIds.add(t.id));
        console.log(`Query "${q}" → ${r.data.threads?.length || 0} threads`);
      } catch (e) {
        console.error('Query failed:', q, e.message);
      }
    }

    console.log(`Total unique threads: ${threadIds.size}`);

    if (!threadIds.size) {
      return res.status(200).json({ added: 0, skipped: 0, threads_found: 0, message: 'No emails with "invoice", "receipt" or "statement" in subject found' });
    }

    // Get existing expenses to avoid duplicates
    const existingRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'expenses!A:Z',
    }).catch(() => ({ data: { values: [] } }));
    const existingNotes = (existingRows.data.values || []).slice(1).map(r => r[7] || '').join(' ');

    const added = [];
    const skipped = [];
    const notExpense = [];

    for (const threadId of threadIds) {
      try {
        const threadData = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
        // Use most recent message in thread
        const messages = threadData.data.messages || [];
        if (!messages.length) continue;
        const msg = messages[messages.length - 1];

        const msgId = msg.id;

        // Skip if already processed
        if (existingNotes.includes(`email:${msgId}`)) {
          skipped.push(`dup:${msgId}`);
          continue;
        }

        const headers = msg.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const sender  = headers.find(h => h.name === 'From')?.value || '';
        const dateStr = headers.find(h => h.name === 'Date')?.value || '';
        const date    = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        const body = extractBody(msg.payload);
        const preview = body.substring(0, 200) || subject;

        console.log(`Processing: "${subject}" from ${sender} — body ${body.length} chars`);

        // Let AI decide if it's an expense
        const parsed = await classifyAndParse(subject, sender, date, body || subject);

        if (!parsed.is_expense) {
          console.log(`  Not expense: ${parsed.reason}`);
          notExpense.push(`${subject}: ${parsed.reason}`);
          continue;
        }

        const amount = parseFloat(parsed.amount);
        if (!amount || amount <= 0 || amount > 100000) {
          console.log(`  Expense but no valid amount: ${parsed.amount}`);
          // Still add it with amount 0 so user can fill in
          parsed.amount = '0.00';
        }

        console.log(`  ✓ Expense: ${parsed.description} — $${parsed.amount}`);

        const row = [
          generateId(),
          parsed.description || subject,
          parsed.category || 'Other',
          parsed.amount || '0.00',
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

        added.push({
          description: parsed.description || subject,
          category: parsed.category,
          amount: parsed.amount,
          date,
          vendor: parsed.vendor,
        });

        await new Promise(r => setTimeout(r, 400));

      } catch (e) {
        console.error('Thread error:', threadId, e.message);
        skipped.push(`err:${threadId}:${e.message}`);
      }
    }

    console.log(`Done — added:${added.length} skipped:${skipped.length} not_expense:${notExpense.length}`);

    return res.status(200).json({
      success: true,
      added: added.length,
      skipped: skipped.length,
      threads_found: threadIds.size,
      not_expense: notExpense.length,
      expenses: added,
    });

  } catch (err) {
    console.error('Scan error:', err.message, err.stack);
    return res.status(500).json({ error: err.message, details: err.code });
  }
};
