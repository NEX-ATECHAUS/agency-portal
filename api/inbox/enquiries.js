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

async function classifyEnquiry(subject, sender, date, body) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are reviewing an email received by Nex-a Technology Solutions (hello@nex-a.com.au), a tech agency.

Determine if this is a new business enquiry, lead, or contact from a potential or existing client.

Subject: ${subject}
From: ${sender}
Date: ${date}
Content: ${(body || subject).substring(0, 2000)}

Return ONLY valid JSON:
{
  "is_enquiry": true or false,
  "confidence": "high | medium | low",
  "reason": "one sentence",
  "contact_name": "sender's name if found, else null",
  "contact_email": "sender's email address",
  "company": "company name if found, else null",
  "phone": "phone number if found, else null",
  "enquiry_type": "new_lead | existing_client | referral | support | spam | other",
  "summary": "1-2 sentence summary of what they want",
  "suggested_action": "what Nex-a should do next"
}`
    }]
  });
  const raw = msg.content[0].text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match[0]);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const fromDate = req.body?.from ? new Date(req.body.from) : new Date(Date.now() - 30 * 86400000);
    const y = fromDate.getFullYear();
    const m = String(fromDate.getMonth() + 1).padStart(2, '0');
    const d = String(fromDate.getDate()).padStart(2, '0');
    const afterClause = `after:${y}/${m}/${d}`;

    // Search for inbound emails that could be enquiries
    const OWN = '-from:hello@nex-a.com.au -from:sean@nex-a.com.au -from:accounts@nchhair.com -from:noreply -from:no-reply -from:notifications -from:donotreply';
    const q = `to:hello@nex-a.com.au ${OWN} ${afterClause}`;

    const r = await gmail.users.threads.list({ userId: 'me', q, maxResults: 50 });
    const threads = r.data.threads || [];
    console.log(`Found ${threads.length} potential enquiry threads`);

    if (!threads.length) return res.status(200).json({ results: [], threads_found: 0 });

    const results = [];

    for (const thread of threads) {
      try {
        const td = await gmail.users.threads.get({ userId: 'me', id: thread.id, format: 'full' });
        const msg = (td.data.messages || [])[0];
        if (!msg) continue;

        const headers = msg.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const sender  = headers.find(h => h.name === 'From')?.value || '';
        const dateStr = headers.find(h => h.name === 'Date')?.value || '';
        const date    = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        // Skip automated/system emails
        if (/unsubscribe|newsletter|noreply|no-reply|auto.?reply|out.of.office|delivery.fail/i.test(subject + sender)) continue;

        const body = extractBody(msg);
        const ai = await classifyEnquiry(subject, sender, date, body);

        if (!ai.is_enquiry || ai.enquiry_type === 'spam') continue;

        results.push({
          threadId: thread.id,
          msgId: msg.id,
          subject, sender, date,
          ...ai,
        });

        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error('Thread err:', e.message);
      }
    }

    return res.status(200).json({ results, threads_found: threads.length });

  } catch (err) {
    console.error('Enquiry scan error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
