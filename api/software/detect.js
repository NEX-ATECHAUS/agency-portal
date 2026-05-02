const { getSheetsClient, getOAuthClient } = require('../_sheets-auth');
const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function detectAppsFromText(text, clientName, projectTitle) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are analysing project information for a tech agency to detect what software applications, platforms, and tools the client is using.

Client: ${clientName}
Project: ${projectTitle}
Text to analyse:
${text.substring(0, 4000)}

Extract every distinct software app, platform, tool, or service mentioned or implied.
Include: CRMs, accounting software, communication tools, project management tools, APIs, integrations, cloud services, websites, portals, automation tools.
Exclude: generic terms like "database", "website", "system", "platform" unless a specific product is named.

Return ONLY valid JSON — an array of objects:
[
  {
    "app_name": "exact product name e.g. HubSpot",
    "category": "CRM | Project Management | Communication | Accounting | Design | Development | Marketing | Analytics | Security | Storage | Automation | Integration | Other",
    "url": "official website URL if you know it, else null",
    "confidence": "high | medium | low",
    "evidence": "brief quote or reason why you detected this"
  }
]

If no software is detected, return an empty array: []`
    }]
  });

  const raw = msg.content[0].text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

async function getEmailsForClient(gmail, clientEmail, days = 180) {
  if (!clientEmail) return '';
  try {
    const y = new Date(Date.now() - days * 86400000);
    const after = `after:${y.getFullYear()}/${String(y.getMonth()+1).padStart(2,'0')}/${String(y.getDate()).padStart(2,'0')}`;
    const r = await gmail.users.threads.list({
      userId: 'me',
      q: `from:${clientEmail} OR to:${clientEmail} ${after}`,
      maxResults: 20,
    });
    const threads = r.data.threads || [];
    let allText = '';
    for (const t of threads.slice(0, 10)) {
      const td = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' });
      const msg = (td.data.messages || [])[0];
      if (!msg) continue;
      const walk = (part) => {
        if (part?.mimeType === 'text/plain' && part.body?.data)
          allText += Buffer.from(part.body.data, 'base64').toString('utf-8').substring(0, 500) + '\n';
        if (part?.parts) part.parts.forEach(walk);
      };
      walk(msg.payload);
      await new Promise(r => setTimeout(r, 100));
    }
    return allText;
  } catch { return ''; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { project_id, client_id } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });

  try {
    const sheets = getSheetsClient();
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    // Get project details
    const projRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'projects!A:Z',
    });
    const pHeaders = projRows.data.values?.[0] || [];
    const projRow = (projRows.data.values || []).slice(1).find(r => r[0] === project_id);
    if (!projRow) return res.status(404).json({ error: 'Project not found' });
    const project = {};
    pHeaders.forEach((h, i) => { project[h] = projRow[i] || ''; });

    // Get client details
    const clientRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'clients!A:Z',
    });
    const cHeaders = clientRows.data.values?.[0] || [];
    const clientRow = (clientRows.data.values || []).slice(1).find(r => r[0] === (client_id || project.client_id));
    const client = {};
    if (clientRow) cHeaders.forEach((h, i) => { client[h] = clientRow[i] || ''; });

    // Get proposal for this project
    const propRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'proposals!A:Z',
    });
    const propHeaders = propRows.data.values?.[0] || [];
    const proposal = (propRows.data.values || []).slice(1).find(r => r[2] === (client_id || project.client_id));
    const proposalText = proposal ? propHeaders.map((h, i) => `${h}: ${proposal[i] || ''}`).join('\n') : '';

    // Combine all text for analysis
    const emailText = await getEmailsForClient(gmail, client.email, 180);

    const combinedText = [
      `Project Title: ${project.title}`,
      `Project Type: ${project.type}`,
      `Description: ${project.description}`,
      `Notes: ${project.notes}`,
      `Proposal Scope: ${proposalText}`,
      emailText ? `\nEmail conversations:\n${emailText}` : '',
    ].filter(Boolean).join('\n\n');

    // Detect apps
    const detected = await detectAppsFromText(combinedText, client.name || project.client_name, project.title);

    // Filter to high/medium confidence
    const confident = detected.filter(a => a.confidence !== 'low' && a.app_name);

    // Check which ones already exist in software_stack for this client
    const stackRows = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'software_stack!A:Z',
    }).catch(() => ({ data: { values: [] } }));
    const existingApps = new Set(
      (stackRows.data.values || []).slice(1)
        .filter(r => r[1] === (client_id || project.client_id))
        .map(r => (r[3] || '').toLowerCase())
    );

    const newApps = confident.filter(a => !existingApps.has(a.app_name.toLowerCase()));
    const alreadyTracked = confident.filter(a => existingApps.has(a.app_name.toLowerCase()));

    return res.status(200).json({
      detected: confident,
      new_apps: newApps,
      already_tracked: alreadyTracked.map(a => a.app_name),
      project_title: project.title,
      client_name: client.name || project.client_name,
    });

  } catch (err) {
    console.error('Detect error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
