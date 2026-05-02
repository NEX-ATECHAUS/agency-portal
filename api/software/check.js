const { getSheetsClient, getOAuthClient } = require('../_sheets-auth');
const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function checkAppForUpdates(appName, appUrl, lastChecked) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
    }],
    messages: [{
      role: 'user',
      content: `Search for recent updates, important notices, outages, security alerts, or significant changes for "${appName}" ${appUrl ? `(${appUrl})` : ''} in the last 30 days.

Only report something if it is genuinely important for a business using this software — security vulnerabilities, breaking changes, service outages, pricing changes, feature deprecations, or major new capabilities.

Return ONLY valid JSON:
{
  "has_update": true or false,
  "update_type": "security | outage | breaking_change | pricing | new_feature | deprecation | other | none",
  "summary": "1-2 sentence plain English summary, or null if nothing important",
  "urgency": "urgent | important | informational | none",
  "source_hint": "where this info was found"
}`
    }]
  });

  // Extract text response
  const textBlock = msg.content.find(b => b.type === 'text');
  if (!textBlock) return { has_update: false, urgency: 'none', summary: null };

  try {
    const raw = textBlock.text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { has_update: false, urgency: 'none', summary: null };
  } catch {
    return { has_update: false, urgency: 'none', summary: null };
  }
}

async function sendUpdateEmail(gmail, to, clientName, updates, companyName) {
  const itemsHtml = updates.map(u => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;font-weight:600;color:#06090A;width:140px;vertical-align:top">${u.app_name}</td>
      <td style="padding:12px 0 12px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#374151;line-height:1.6">${u.update_summary}
        <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:${u.urgency === 'urgent' ? '#fee2e2' : u.urgency === 'important' ? '#fef3c7' : '#f0fdf4'};color:${u.urgency === 'urgent' ? '#991b1b' : u.urgency === 'important' ? '#92400e' : '#065f46'}">${u.urgency}</span>
      </td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;color:#06090A}</style>
</head><body>
<div style="max-width:600px;margin:0 auto;padding:28px 16px 48px">
  <div style="background:#06090A;border-radius:12px 12px 0 0;padding:20px 28px;display:flex;align-items:center;justify-content:space-between">
    <span style="color:#fff;font-size:14px;font-weight:600">${companyName}</span>
    <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em">Software Update Report</span>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px 32px">
    <h2 style="font-size:18px;font-weight:700;margin-bottom:8px">Software Updates for ${clientName}</h2>
    <p style="font-size:13px;color:#6b7280;margin-bottom:24px">We've scanned for important updates across your software stack. Here's what you need to know:</p>
    <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
    <p style="margin-top:24px;font-size:12px;color:#9ca3af;line-height:1.7">This report only includes updates that are relevant to your business. You don't need to action everything — we'll advise where needed. If you have questions about any of these, reply to this email.</p>
  </div>
  <div style="text-align:center;padding:20px 0;font-size:11px;color:#9ca3af">© ${new Date().getFullYear()} ${companyName}</div>
</div></body></html>`;

  const subject = `Software Update Report — ${updates.length} update${updates.length !== 1 ? 's' : ''} for ${clientName}`;
  const lines = [
    `From: ${process.env.GMAIL_FROM || 'hello@nex-a.com.au'}`,
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    '',
    html,
  ];
  const raw = Buffer.from(lines.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Verify cron secret for automated runs
  const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
  if (req.method === 'GET' && cronSecret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sheets = getSheetsClient();
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    // Get all software stack entries
    const stackRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'software_stack!A:Z',
    });

    const rows = stackRows.data.values || [];
    if (rows.length <= 1) return res.status(200).json({ message: 'No software stack entries found', checked: 0 });

    const headers = rows[0];
    const entries = rows.slice(1).map((row, idx) => {
      const obj = { _rowIndex: idx + 2 };
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });

    // Group by client
    const byClient = {};
    entries.forEach(e => {
      const key = e.client_id || e.client_name || 'unknown';
      if (!byClient[key]) byClient[key] = { clientName: e.client_name, entries: [] };
      byClient[key].entries.push(e);
    });

    const companyName = process.env.ADMIN_NAME ? `${process.env.ADMIN_NAME} — NEX-A` : 'NEX-A Technology Solutions';
    const results = { checked: 0, updates_found: 0, emails_sent: 0, clients_processed: [] };

    for (const [clientKey, clientData] of Object.entries(byClient)) {
      const clientUpdates = [];

      for (const entry of clientData.entries) {
        try {
          console.log(`Checking ${entry.app_name} for ${clientData.clientName}...`);
          const check = await checkAppForUpdates(entry.app_name, entry.url, entry.last_checked);
          results.checked++;

          // Update the sheet with check timestamp
          const now = new Date().toISOString();
          const rowIdx = entry._rowIndex;
          const updateRange = `software_stack!K${rowIdx}:L${rowIdx}`; // last_checked, last_update_found
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: updateRange,
            valueInputOption: 'RAW',
            requestBody: { values: [[now, check.has_update ? now : entry.last_update_found]] },
          });

          if (check.has_update && check.urgency !== 'none' && check.summary) {
            // Update the update_summary in sheet (col M index 12)
            await sheets.spreadsheets.values.update({
              spreadsheetId: process.env.SPREADSHEET_ID,
              range: `software_stack!M${rowIdx}`,
              valueInputOption: 'RAW',
              requestBody: { values: [[check.summary]] },
            });

            clientUpdates.push({ ...entry, update_summary: check.summary, urgency: check.urgency });
            results.updates_found++;
          }

          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error(`Error checking ${entry.app_name}:`, e.message);
        }
      }

      // Send email to client if there are important updates
      const importantUpdates = clientUpdates.filter(u => u.urgency === 'urgent' || u.urgency === 'important');
      if (importantUpdates.length > 0) {
        // Get client email from clients sheet
        const clientsRows = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: 'clients!A:Z',
        }).catch(() => ({ data: { values: [] } }));

        const clientRow = (clientsRows.data.values || []).slice(1)
          .find(r => r[0] === clientKey || r[1] === clientData.clientName);
        const clientEmail = clientRow?.[2];

        if (clientEmail) {
          try {
            await sendUpdateEmail(gmail, clientEmail, clientData.clientName, importantUpdates, companyName);
            results.emails_sent++;
            results.clients_processed.push({ client: clientData.clientName, updates: importantUpdates.length, emailed: true });
          } catch (e) {
            console.error(`Email failed for ${clientData.clientName}:`, e.message);
          }
        }
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('Software check error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
