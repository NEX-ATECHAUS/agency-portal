const { google } = require('googleapis');
const { getOAuthClient } = require('../_sheets-auth');

function buildEmail({ to, subject, html }) {
  const from = process.env.GMAIL_FROM || 'NEX-A PORTAL <noreply@example.com>';
  const message = [`From: ${from}`, `To: ${to}`, 'Content-Type: text/html; charset=utf-8', 'MIME-Version: 1.0', `Subject: ${subject}`, '', html].join('\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function proposalHtml({ proposal, proposalUrl, companyName }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
  .container{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
  .header{background:linear-gradient(135deg,#6c63ff,#5a52d5);padding:40px 32px;text-align:center}
  .header h1{color:#fff;margin:0;font-size:26px;font-weight:700}
  .header p{color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px}
  .body{padding:40px 32px}.body p{color:#444;line-height:1.7;font-size:15px;margin:0 0 16px}
  .btn{display:inline-block;background:#6c63ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;margin:24px 0}
  .details{background:#f8f7ff;border-radius:8px;padding:20px 24px;margin:24px 0}
  .details p{margin:4px 0;color:#555;font-size:14px}.details strong{color:#333}
  .footer{background:#f5f5f5;padding:20px 32px;text-align:center;font-size:12px;color:#999}
  </style></head><body>
  <div class="container">
    <div class="header"><h1>${companyName || 'NEX-A PORTAL'}</h1><p>You have a new proposal to review</p></div>
    <div class="body">
      <p>Hi ${proposal.client_name || 'there'},</p>
      <p>We're excited to share our proposal for <strong>${proposal.title}</strong>. Click below to review and respond.</p>
      <div class="details">
        <p><strong>Project:</strong> ${proposal.title}</p>
        <p><strong>Total Investment:</strong> $${Number(proposal.total_amount || 0).toLocaleString()}</p>
        ${proposal.valid_until ? `<p><strong>Valid Until:</strong> ${proposal.valid_until}</p>` : ''}
      </div>
      <div style="text-align:center"><a href="${proposalUrl}" class="btn">View Proposal →</a></div>
      <p style="font-size:13px;color:#888">Or copy: <a href="${proposalUrl}" style="color:#6c63ff">${proposalUrl}</a></p>
    </div>
    <div class="footer">© ${new Date().getFullYear()} ${companyName || 'NEX-A PORTAL'}</div>
  </div></body></html>`;
}

function invoiceHtml({ invoice, project, companyName, settings }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
  .container{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
  .header{background:linear-gradient(135deg,#6c63ff,#5a52d5);padding:40px 32px}
  .header h1{color:#fff;margin:0;font-size:20px;font-weight:700}
  .header p{color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px}
  .body{padding:40px 32px}
  .amount{font-size:36px;font-weight:700;color:#6c63ff}
  .label{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}
  .grid p{margin:2px 0;font-size:14px;color:#444}
  .desc{background:#f9f9f9;border-radius:8px;padding:16px 20px;margin:16px 0;font-size:14px;color:#555;line-height:1.6}
  .payment{border-top:2px solid #f0f0f0;padding-top:24px;margin-top:24px}
  .payment h3{font-size:15px;font-weight:600;color:#333;margin:0 0 12px}
  .payment p{font-size:14px;color:#555;margin:6px 0}
  .footer{background:#f5f5f5;padding:20px 32px;text-align:center;font-size:12px;color:#999}
  </style></head><body>
  <div class="container">
    <div class="header"><h1>${companyName || 'NEX-A PORTAL'}</h1><p>${invoice.is_reminder ? '⏰ Payment Reminder — ' : ''}Invoice ${invoice.invoice_number}</p></div>
    <div class="body">
      <div class="label">Amount Due</div>
      <div class="amount">$${Number(invoice.amount||0).toLocaleString('en-AU',{minimumFractionDigits:2})}</div>
      <div class="grid">
        <div><div class="label">Invoice #</div><p><strong>${invoice.invoice_number}</strong></p></div>
        <div><div class="label">Due Date</div><p><strong>${invoice.due_date||'On receipt'}</strong></p></div>
        <div><div class="label">Project</div><p>${project?.title||invoice.project_id||'—'}</p></div>
        <div><div class="label">Stage</div><p>${invoice.stage||'—'}</p></div>
      </div>
      ${invoice.stage_description ? `<div class="desc">${invoice.stage_description}</div>` : ''}
      <div class="payment">
        <h3>Payment Details</h3>
        ${settings?.bank_bsb ? `<p><strong>Bank Transfer:</strong> BSB: ${settings.bank_bsb} | Account: ${settings.bank_account}</p>` : ''}
        ${settings?.paypal_link ? `<p><strong>PayPal:</strong> <a href="${settings.paypal_link}">${settings.paypal_link}</a></p>` : ''}
        ${settings?.stripe_link ? `<p><strong>Stripe:</strong> <a href="${settings.stripe_link}">${settings.stripe_link}</a></p>` : ''}
        ${settings?.payment_terms ? `<p style="margin-top:12px;font-size:13px;color:#888">${settings.payment_terms}</p>` : ''}
      </div>
    </div>
    <div class="footer">${settings?.invoice_footer || `© ${new Date().getFullYear()} ${companyName || 'NEX-A PORTAL'}`}</div>
  </div></body></html>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { type, to, proposal, proposalUrl, invoice, project, companyName, settings } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing recipient email' });
  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    let subject, html;
    if (type === 'proposal') {
      subject = `Proposal: ${proposal.title} — ${companyName || 'NEX-A PORTAL'}`;
      html = proposalHtml({ proposal, proposalUrl, companyName });
    } else if (type === 'invoice') {
      subject = invoice.is_reminder
        ? `Payment Reminder — Invoice ${invoice.invoice_number} — $${Number(invoice.amount||0).toLocaleString('en-AU',{minimumFractionDigits:2})} Due ${invoice.due_date||'on receipt'}`
        : `Invoice ${invoice.invoice_number} — $${Number(invoice.amount||0).toLocaleString('en-AU',{minimumFractionDigits:2})} Due ${invoice.due_date||'on receipt'}`;
      html = invoiceHtml({ invoice, project, companyName, settings });
    } else {
      return res.status(400).json({ error: 'Invalid type. Use "proposal" or "invoice"' });
    }
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: buildEmail({ to, subject, html }) },
    });
    return res.status(200).json({ success: true, messageId: result.data.id });
  } catch (err) {
    console.error('Email send error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
