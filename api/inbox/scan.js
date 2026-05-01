const { google } = require('googleapis');
const { getOAuthClient, getSheetsClient } = require('../_sheets-auth');
const Anthropic = require('@anthropic-ai/sdk');

function generateId() {
  return 'EXP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function extractBody(payload) {
  let text = '';
  let html = '';
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      html += Buffer.from(part.body.data, 'base64').toString('utf-8')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (part.parts) part.parts.forEach(walk);
  };
  walk(payload);
  return (text || html).trim();
}

async function classifyAndParse(subject, sender, date, body, snippet) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content = body.length > 100 ? body.substring(0, 2500) : snippet;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are reviewing an email received by a tech agency (Nex-a Technology Solutions, hello@nex-a.com.au) to see if it represents a business EXPENSE they need to pay or already paid.

Subject: ${subject}
From: ${sender}
Date: ${date}
Content: ${content}

Rules:
- YES (expense) if: this is a receipt, invoice, or bill charging Nex-a for something they purchased — software subscriptions, SaaS tools, cloud services, contractor work, advertising, hardware, etc.
- NO if: this is an invoice Nex-a sent TO a client, a test notification from their own systems (nchhair.com, nex-a.com.au), an AWS notification email (not an actual invoice), or a non-financial email

Return ONLY valid JSON:
{
  "is_expense": true or false,
  "reason": "one sentence",
  "description": "what was purchased (if expense)",
  "category": "Software | Subscriptions | Marketing | Hardware | Travel | Office | Contractor | Food | Other",
  "amount": "AUD amount as string e.g. 34.00, or null if not found",
  "vendor": "vendor name",
  "notes": "receipt/invoice number if found"
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

    console.log(`Scanning newer_than:${daysAgo}d`);

    // Targeted queries — exclude own domains and known noise upfront
    const OWN = '-from:hello@nex-a.com.au -from:sean@nex-a.com.au -from:accounts@nchhair.com -from:autolab@nex-a.com.au';
    const queries = [
      `subject:invoice ${OWN} -subject:TEST newer_than:${daysAgo}d`,
      `subject:receipt ${OWN} newer_than:${daysAgo}d`,
      `subject:statement ${OWN} newer_than:${daysAgo}d`,
    ];

    const threadMap = new Map(); // id → snippet for dedup
    for (const q of queries) {
      try {
        const r = await gmail.users.threads.list({ userId: 'me', q, maxResults: 50 });
        (r.data.threads || []).forEach(t => threadMap.set(t.id, t.snippet || ''));
        console.log(`"${q}" → ${r.data.threads?.length || 0}`);
      } catch (e) { console.error('Query failed:', q, e.message); }
    }

    console.log(`Unique threads: ${threadMap.size}`);
    if (!threadMap.size) {
      return res.status(200).json({ added: 0, skipped: 0, threads_found: 0, not_expense: 0 });
    }

    // Get existing to deduplicate
    const existingRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'expenses!A:Z',
    }).catch(() => ({ data: { values: [] } }));
    const existingNotes = (existingRows.data.values || []).slice(1).map(r => r[7] || '').join(' ');

    const added = [];
    const skipped = [];
    const notExpense = [];

    for (const [threadId, threadSnippet] of threadMap) {
      try {
        const threadData = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
        const messages = threadData.data.messages || [];
        if (!messages.length) continue;

        // Use the first (original) message, not the last reply
        const msg = messages[0];
        const msgId = msg.id;

        if (existingNotes.includes(`email:${msgId}`)) {
          skipped.push(`dup:${msgId}`); continue;
        }

        const headers = msg.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const sender  = headers.find(h => h.name === 'From')?.value || '';
        const dateStr = headers.find(h => h.name === 'Date')?.value || '';
        const date    = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        // Hard-exclude own outgoing emails and test systems
        const senderLower = sender.toLowerCase();
        if (
          senderLower.includes('nex-a.com.au') ||
          senderLower.includes('nchhair.com') ||
          subject.toLowerCase().startsWith('test') ||
          subject.toLowerCase().startsWith('fwd:') ||
          subject.toLowerCase().startsWith('re:')
        ) {
          skipped.push(`own/noise:${subject}`); continue;
        }

        const body = extractBody(msg.payload);
        console.log(`Checking: "${subject}" from ${sender} (${body.length} chars body)`);

        const parsed = await classifyAndParse(subject, sender, date, body, threadSnippet);
        console.log(`  → is_expense:${parsed.is_expense} | ${parsed.reason}`);

        if (!parsed.is_expense) {
          notExpense.push(subject); continue;
        }

        const amount = parseFloat(parsed.amount);
        const amountStr = (!isNaN(amount) && amount > 0) ? amount.toFixed(2) : '0.00';

        const row = [
          generateId(),
          parsed.description || subject,
          parsed.category || 'Other',
          amountStr,
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

        added.push({ description: parsed.description || subject, category: parsed.category, amount: amountStr, date, vendor: parsed.vendor });
        console.log(`  ✓ Added: ${parsed.description} $${amountStr}`);
        await new Promise(r => setTimeout(r, 400));

      } catch (e) {
        console.error('Thread error:', threadId, e.message);
        skipped.push(`err:${e.message}`);
      }
    }

    console.log(`Result: +${added.length} added, ${notExpense.length} not expenses, ${skipped.length} skipped`);
    return res.status(200).json({
      success: true, added: added.length, skipped: skipped.length,
      threads_found: threadMap.size, not_expense: notExpense.length, expenses: added,
    });

  } catch (err) {
    console.error('Scan error:', err.message);
    return res.status(500).json({ error: err.message, details: err.code });
  }
};
