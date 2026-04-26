const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, projectTitle, projectType, stage, clientName } = req.body;

  if (type !== 'invoice_description') {
    return res.status(400).json({ error: 'Invalid type. Use "invoice_description"' });
  }

  if (!stage) {
    return res.status(400).json({ error: 'Missing required field: stage' });
  }

  const stageDescriptions = {
    Discovery: 'requirements gathering, stakeholder interviews, technical scoping, project planning, and delivery of a detailed project specification document',
    Design: 'UX research, wireframing, visual design, UI component library creation, design system documentation, and client review iterations',
    Development: 'full-stack implementation, database architecture, API development, frontend build, third-party integrations, and code review',
    Testing: 'comprehensive QA testing, bug fixing, performance optimisation, cross-browser/device testing, and user acceptance testing',
    Deployment: 'production environment setup, CI/CD pipeline configuration, DNS and SSL configuration, live deployment, and post-launch monitoring',
    Training: 'staff training sessions, documentation creation, handover materials, knowledge transfer, and 30-day post-launch support',
  };

  const stageDetail = stageDescriptions[stage] || `completion of the ${stage} phase`;

  const prompt = `You are writing a professional invoice line-item description for an agency invoice.

Project: ${projectTitle || 'Client Project'}
Project Type: ${projectType || 'Web Development'}
Stage: ${stage}
Client: ${clientName || 'Client'}
Stage activities: ${stageDetail}

Write a concise, professional invoice description (2–3 sentences) for this stage. 
- Write in third person or neutral voice
- Be specific about deliverables without being overly technical
- Sound polished and confident
- Do NOT include price, invoice number, or dates
- Do NOT use bullet points — write as flowing prose

Return ONLY the description text, nothing else.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const description = message.content[0]?.text?.trim();

    if (!description) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }

    return res.status(200).json({ description });
  } catch (err) {
    console.error('AI generate error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate description' });
  }
};
