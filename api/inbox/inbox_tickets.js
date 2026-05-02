const { google } = require('googleapis');
const { getOAuthClient, getSheetsClient } = require('../_sheets-auth');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractBody(msg) {
  if (msg.plaintextBody) return msg.plaintextBody.trim();
  let text = '', html = '';
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data)
      text += Buffer.from(part.body.data, 'base64').toString('utf-8');
    if (part.mimeType === 'text/html' && part.body?.data)
      html += Buffer.from(part.body.data, 'base64').toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (part.parts) part.parts.forEach(walk);
  };
  walk(msg.payload || msg);
  return (text || html).trim();
}

async function classifyTicket(subject, sender, date, body) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are reviewing an email received by Nex-a Technology Solutions (hello@nex-a.com.au), a tech agency.

Is this a support request, bug report, or technical issue from a client?

Subject: ${subject}
From: ${sender}
Date: ${date}
Content: ${(body || subject).substring(0, 2000)}

Return ONLY valid JSON:
{
  "is_ticket": true or false,
  "reason": "one sentence",
  "priority": "urgent | high | medium | low",
  "subject": "clear concise ticket title",
  "description": "summary of the issue or request",
  "client_name": "client/company name if identifiable",
  "client_email": "sender email address",
  "category": "bug | feature_request | question | access | performance | other"
}`
    }]
  });
  const raw = msg.content[0].text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    const sheets = getSheetsClient();

    const fromDate = req.body?.from ? new Date(req.body.from) : new Date(Date.now() - 30 * 86400000);
    const y = fromDate.getFullYear();
    const m = String(fromDate.getMonth() + 1).padStart(2, '0');
    const d = String(fromDate.getDate()).padStart(2, '0');
    const after = `after:${y}/${m}/${d}`;

    const OWN = '-from:hello@nex-a.com.au -from:sean@nex-a.com.au -from:noreply -from:no-reply -from:notifications';
    const queries = [
      `(subject:bug OR subject:issue OR subject:error OR subject:problem OR subject:help OR subject:support OR subject:"not working") ${OWN} to:hello@nex-a.com.au ${after}`,
      `(subject:fix OR subject:broken OR subject:urgent OR subject:crash OR subject:"can you") ${OWN} to:hello@nex-a.com.au ${after}`,
    ];

    const threadMap = new Map();
    for (const q of queries) {
      const r = await gmail.users.threads.list({ userId: 'me', q, maxResults: 30 });
      (r.data.threads || []).forEach(t => threadMap.set(t.id, t.snippet || ''));
    }

    // Get existing ticket thread IDs to avoid duplicates
    const existingRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'tickets!A:Z',
    }).catch(() => ({ data: { values: [] } }));
    const existingThreadIds = new Set(
      (existingRows.data.values || []).slice(1).map(r => r[13] || '') // thread_id is col N index 13... actually let's check col index
    );
    // thread_id is at index 11 in schema: id,subject,client_id,client_name,project_id,project_title,status,priority,description,thread_id
    // Actually index 9 (0-based): id(0),subject(1),client_id(2),client_name(3),project_id(4),project_title(5),status(6),priority(7),description(8),thread_id(9)
    const threadIds = new Set((existingRows.data.values || []).slice(1).map(r => r[9] || ''));

    const results = [];

    for (const [threadId] of threadMap) {
      if (threadIds.has(threadId)) continue;

      try {
        const td = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
        const msg = (td.data.messages || [])[0];
        if (!msg) continue;

        const headers = msg.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const sender  = headers.find(h => h.name === 'From')?.value || '';
        const dateStr = headers.find(h => h.name === 'Date')?.value || '';
        const date    = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        if (/unsubscribe|newsletter|noreply|auto.?reply/i.test(sender + subject)) continue;

        const body = extractBody(msg);
        const ai = await classifyTicket(subject, sender, date, body);
        if (!ai.is_ticket) continue;

        results.push({ threadId, msgId: msg.id, date, originalSubject: subject, sender, ...ai });
        await new Promise(r => setTimeout(r, 300));
      } catch (e) { console.error('Thread err:', e.message); }
    }

    return res.status(200).json({ results, threads_found: threadMap.size });
  } catch (err) {
    console.error('Ticket scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
