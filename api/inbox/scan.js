const { google } = require('googleapis');
const { getOAuthClient, getSheetsClient } = require('../_sheets-auth');
const Anthropic = require('@anthropic-ai/sdk');

function extractBody(msg) {
  if (msg.plaintextBody) return msg.plaintextBody.trim();
  let text = '', html = '';
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data)
      text += Buffer.from(part.body.data, 'base64').toString('utf-8');
    if (part.mimeType === 'text/html' && part.body?.data)
      html += Buffer.from(part.body.data, 'base64').toString('utf-8')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (part.parts) part.parts.forEach(walk);
  };
  walk(msg.payload || msg);
  return (text || html).trim();
}

async function classifyWithAI(subject, sender, date, body) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are reviewing an email for a tech agency called Nex-a Technology Solutions (hello@nex-a.com.au).

Determine if this email represents a business expense — something Nex-a has been charged for or needs to pay.

Subject: ${subject}
From: ${sender}
Date: ${date}
Email content:
${(body || subject).substring(0, 2000)}

Return ONLY valid JSON, no markdown:
{
  "is_expense": true or false,
  "confidence": "high | medium | low",
  "reason": "one clear sentence explaining your decision",
  "description": "concise description of the purchase (if expense)",
  "category": "Software | Subscriptions | Marketing | Hardware | Travel | Office | Contractor | Food | Other",
  "amount": "numeric string e.g. 34.00, or null if not found",
  "vendor": "vendor/company name",
  "notes": "invoice or receipt number if present"
}`
    }]
  });
  const text = msg.content[0].text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

// POST /api/inbox/scan — scan and return AI results without writing
// POST /api/inbox/scan with { confirm: [...] } — write approved items
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = getOAuthClient();
  const sheets = getSheetsClient();
  const gmail = google.gmail({ version: 'v1', auth });

  // ── CONFIRM: write approved expenses ─────────────────
  if (req.body?.confirm) {
    const items = req.body.confirm;
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'No items to confirm' });

    const added = [];
    for (const item of items) {
      try {
        const id = 'EXP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const row = [
          id,
          item.description,
          item.category || 'Other',
          item.amount || '0.00',
          item.date,
          '',
          '',
          `${item.notes || ''} | Vendor: ${item.vendor || ''} | email:${item.msgId}`,
          new Date().toISOString(),
        ];
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: 'expenses!A:Z',
          valueInputOption: 'RAW',
          requestBody: { values: [row] },
        });
        added.push(item);
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.error('Write error:', e.message);
      }
    }
    return res.status(200).json({ success: true, added: added.length });
  }

  // ── SCAN: find emails and run AI, return results ──────
  try {
    const fromDate = req.body?.from ? new Date(req.body.from) : new Date(Date.now() - 90 * 86400000);
    // Use after:YYYY/MM/DD — more reliable in Gmail API than newer_than:Xd
    const y = fromDate.getFullYear();
    const m = String(fromDate.getMonth() + 1).padStart(2, '0');
    const d = String(fromDate.getDate()).padStart(2, '0');
    const afterClause = `after:${y}/${m}/${d}`;
    const OWN = '-from:hello@nex-a.com.au -from:sean@nex-a.com.au -from:accounts@nchhair.com -from:autolab@nex-a.com.au';

    console.log('Scanning with:', afterClause);

    const threadMap = new Map();
    for (const q of [
      `subject:invoice ${OWN} -subject:TEST ${afterClause}`,
      `subject:receipt ${OWN} ${afterClause}`,
      `subject:statement ${OWN} ${afterClause}`,
    ]) {
      try {
        const r = await gmail.users.threads.list({ userId: 'me', q, maxResults: 50 });
        const found = r.data.threads || [];
        console.log(`  Query: ${q.split(' ')[0]} ${q.split(' ')[1]} → ${found.length} results`);
        found.forEach(t => threadMap.set(t.id, t.snippet || ''));
      } catch (e) { console.error('Query err:', q, e.message); }
    }

    if (!threadMap.size) return res.status(200).json({ results: [], threads_found: 0 });

    // Build processed ID set to skip already-imported ones
    const existingRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID, range: 'expenses!A:Z',
    }).catch(() => ({ data: { values: [] } }));
    const processedIds = new Set();
    (existingRows.data.values || []).slice(1).forEach(r => {
      const m = (r[7] || '').match(/email:([a-f0-9]+)/);
      if (m) processedIds.add(m[1]);
    });

    const results = [];

    for (const [threadId] of threadMap) {
      try {
        const td = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
        const msg = (td.data.messages || [])[0];
        if (!msg) continue;

        const msgId = msg.id;
        if (processedIds.has(msgId)) continue; // already imported

        const headers = msg.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const sender  = headers.find(h => h.name === 'From')?.value || '';
        const dateStr = headers.find(h => h.name === 'Date')?.value || '';
        const date    = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        // Skip own outgoing and noise
        if (
          sender.toLowerCase().includes('nex-a.com.au') ||
          sender.toLowerCase().includes('nchhair.com') ||
          /^(re:|fwd:|test\b)/i.test(subject.trim())
        ) continue;

        const body = extractBody(msg);
        const ai = await classifyWithAI(subject, sender, date, body);

        results.push({
          msgId,
          subject,
          sender,
          date,
          is_expense: ai.is_expense,
          confidence: ai.confidence,
          reason: ai.reason,
          description: ai.description || subject,
          category: ai.category || 'Other',
          amount: ai.amount || null,
          vendor: ai.vendor || sender,
          notes: ai.notes || '',
        });

        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error('Thread err:', e.message);
      }
    }

    return res.status(200).json({ results, threads_found: threadMap.size });

  } catch (err) {
    console.error('Scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
