const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

function buildEmail({ to, subject, html }) {
  const from = process.env.GMAIL_FROM || 'Agency Portal <noreply@example.com>';
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    html,
  ];
  const message = messageParts.join('\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function proposalHtml({ proposal, proposalUrl, companyName }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #6c63ff, #5a52d5); padding: 40px 32px; text-align: center; }
  .header h1 { color: #fff; margin: 0; font-size: 28px; font-weight: 700; }
  .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 15px; }
  .body { padding: 40px 32px; }
  .body p { color: #444; line-height: 1.7; font-size: 15px; margin: 0 0 16px; }
  .btn { display: inline-block; background: #6c63ff; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0; }
  .details { background: #f8f7ff; border-radius: 8px; padding: 20px 24px; margin: 24px 0; }
  .details p { margin: 4px 0; color: #555; font-size: 14px; }
  .details strong { color: #333; }
  .footer { background: #f5f5f5; padding: 20px 32px; text-align: center; font-size: 12px; color: #999; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>${companyName || 'Agency Portal'}</h1>
    <p>You have a new proposal to review</p>
  </div>
  <div class="body">
    <p>Hi ${proposal.client_name || 'there'},</p>
    <p>We're excited to share our proposal for <strong>${proposal.title}</strong>. Please click the button below to review the details and let us know if you'd like to proceed.</p>
    <div class="details">
      <p><strong>Project:</strong> ${proposal.title}</p>
      <p><strong>Total Investment:</strong> $${Number(proposal.total_amount || 0).toLocaleString()}</p>
      ${proposal.valid_until ? `<p><strong>Valid Until:</strong> ${proposal.valid_until}</p>` : ''}
    </div>
    <div style="text-align:center">
      <a href="${proposalUrl}" class="btn">View Proposal →</a>
    </div>
    <p style="font-size:13px;color:#888">If the button doesn't work, copy and paste this link into your browser:<br><a href="${proposalUrl}" style="color:#6c63ff;">${proposalUrl}</a></p>
  </div>
  <div class="footer">© ${new Date().getFullYear()} ${companyName || 'Agency Portal'}. All rights reserved.</div>
</div>
</body>
</html>`;
}

function invoiceHtml({ invoice, project, companyName, settings }) {
  const bankDetails = settings?.bank_bsb
    ? `BSB: ${settings.bank_bsb} | Account: ${settings.bank_account}`
    : '';
  const paypalLink = settings?.paypal_link ? `<p><strong>PayPal:</strong> <a href="${settings.paypal_link}" style="color:#6c63ff;">${settings.paypal_link}</a></p>` : '';
  const stripeLink = settings?.stripe_link ? `<p><strong>Stripe:</strong> <a href="${settings.stripe_link}" style="color:#6c63ff;">${settings.stripe_link}</a></p>` : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #6c63ff, #5a52d5); padding: 40px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 700; }
  .header p { color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 14px; }
  .body { padding: 40px 32px; }
  .invoice-box { background: #f8f7ff; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
  .amount { font-size: 36px; font-weight: 700; color: #6c63ff; }
  .label { font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
  .detail-item p { margin: 2px 0; font-size: 14px; color: #444; }
  .detail-item .label { margin-bottom: 2px; }
  .description { background: #f9f9f9; border-radius: 8px; padding: 16px 20px; margin: 16px 0; font-size: 14px; color: #555; line-height: 1.6; }
  .payment-section { border-top: 2px solid #f0f0f0; padding-top: 24px; margin-top: 24px; }
  .payment-section h3 { font-size: 15px; font-weight: 600; color: #333; margin: 0 0 12px; }
  .payment-section p { font-size: 14px; color: #555; margin: 6px 0; }
  .footer { background: #f5f5f5; padding: 20px 32px; text-align: center; font-size: 12px; color: #999; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>${companyName || 'Agency Portal'}</h1>
    <p>Invoice ${invoice.invoice_number}</p>
  </div>
  <div class="body">
    <div class="invoice-box">
      <div class="label">Amount Due</div>
      <div class="amount">$${Number(invoice.amount || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</div>
    </div>
    <div class="details-grid">
      <div class="detail-item">
        <div class="label">Invoice #</div>
        <p><strong>${invoice.invoice_number}</strong></p>
      </div>
      <div class="detail-item">
        <div class="label">Due Date</div>
        <p><strong>${invoice.due_date || 'On receipt'}</strong></p>
      </div>
      <div class="detail-item">
        <div class="label">Project</div>
        <p>${project?.title || invoice.project_id || '—'}</p>
      </div>
      <div class="detail-item">
        <div class="label">Stage</div>
        <p>${invoice.stage || '—'}</p>
      </div>
    </div>
    ${invoice.stage_description ? `<div class="description">${invoice.stage_description}</div>` : ''}
    <div class="payment-section">
      <h3>Payment Details</h3>
      ${bankDetails ? `<p><strong>Bank Transfer:</strong> ${bankDetails}</p>` : ''}
      ${paypalLink}
      ${stripeLink}
      ${settings?.payment_terms ? `<p style="margin-top:12px;font-size:13px;color:#888;">${settings.payment_terms}</p>` : ''}
    </div>
  </div>
  <div class="footer">
    ${settings?.invoice_footer || `© ${new Date().getFullYear()} ${companyName || 'Agency Portal'}. All rights reserved.`}
  </div>
</div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, to, proposal, proposalUrl, invoice, project, companyName, settings } = req.body;

  if (!to) {
    return res.status(400).json({ error: 'Missing recipient email (to)' });
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    let subject, html;

    if (type === 'proposal') {
      if (!proposal || !proposalUrl) {
        return res.status(400).json({ error: 'Missing proposal data or proposalUrl' });
      }
      subject = `Proposal: ${proposal.title} — ${companyName || 'Agency Portal'}`;
      html = proposalHtml({ proposal, proposalUrl, companyName });
    } else if (type === 'invoice') {
      if (!invoice) {
        return res.status(400).json({ error: 'Missing invoice data' });
      }
      subject = `Invoice ${invoice.invoice_number} — $${Number(invoice.amount || 0).toLocaleString()} Due ${invoice.due_date || 'on receipt'}`;
      html = invoiceHtml({ invoice, project, companyName, settings });
    } else {
      return res.status(400).json({ error: 'Invalid type. Use "proposal" or "invoice"' });
    }

    const encodedMessage = buildEmail({ to, subject, html });

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    return res.status(200).json({ success: true, messageId: result.data.id });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send email' });
  }
};
