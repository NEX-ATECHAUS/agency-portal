const { google } = require('googleapis');
const { getOAuthClient } = require('../_sheets-auth');

const LOGO = 'https://static.wixstatic.com/media/f71431_61430c2cad9d4aa3b3c60140cf727352~mv2.png';

function fmtAmount(n) {
  return Number(parseFloat(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(raw) {
  if (!raw) return 'on receipt';
  try {
    const d = new Date(String(raw).includes('T') ? raw : raw + 'T12:00:00');
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}

function buildEmail({ to, subject, html }) {
  const from = process.env.GMAIL_FROM || 'NEX-A <hello@nex-a.com.au>';
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    '',
    html,
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Shared layout wrapper ────────────────────────────────────
function layout({ body, companyName, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;color:#06090A;-webkit-text-size-adjust:100%}
  .wrap{max-width:600px;margin:0 auto;padding:28px 16px 48px}
  .nav{background:#06090A;border-radius:12px 12px 0 0;padding:16px 28px;display:flex;align-items:center;justify-content:space-between}
  .nav-logo{height:28px;width:auto;object-fit:contain;filter:brightness(0) invert(1)}
  .nav-label{color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:0.1em;text-transform:uppercase}
  .card{background:#ffffff;border-radius:0 0 12px 12px;overflow:hidden}
  .hero{background:#06090A;padding:32px 32px 36px;position:relative;overflow:hidden}
  .hero-glow{position:absolute;top:-40px;right:-40px;width:140px;height:140px;background:#c9fcd2;border-radius:50%;opacity:0.06;pointer-events:none}
  .hero-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#c9fcd2;margin-bottom:12px}
  .hero h1{font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;margin-bottom:8px;line-height:1.2}
  .hero p{font-size:13px;color:rgba(255,255,255,0.5);margin:0}
  .hero-amount{font-size:32px;font-weight:700;color:#c9fcd2;letter-spacing:-1px;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08)}
  .hero-amount-label{font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px}
  .body{padding:28px 32px}
  .body p{font-size:14px;color:#374151;line-height:1.75;margin-bottom:14px}
  .meta{display:table;width:100%;margin:20px 0;background:#f9fafb;border-radius:8px;padding:16px 18px}
  .meta-row{display:table-row}
  .meta-label{display:table-cell;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;padding:4px 16px 4px 0;white-space:nowrap}
  .meta-value{display:table-cell;font-size:13px;color:#111;font-weight:500;padding:4px 0}
  .btn-wrap{text-align:center;margin:24px 0}
  .btn{display:inline-block;background:#6effa0;color:#06090A;text-decoration:none;padding:14px 36px;border-radius:999px;font-size:14px;font-weight:700;letter-spacing:0.02em}
  .url-fallback{font-size:11px;color:#9ca3af;text-align:center;margin-top:8px;word-break:break-all}
  .url-fallback a{color:#6b7280}
  .payment-box{margin:20px 0;padding:16px 18px;background:#e8ffef;border:1px solid #98efb7;border-radius:8px}
  .payment-box h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#065f46;margin-bottom:10px}
  .payment-box p{font-size:13px;color:#374151;margin:4px 0;line-height:1.6}
  .divider{height:1px;background:#f0f0f0;margin:20px 0}
  .terms{font-size:11px;color:#9ca3af;line-height:1.7;white-space:pre-line;margin-top:16px}
  .footer{padding:20px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f0f0f0}
  .footer img{height:16px;opacity:0.4;margin-bottom:6px;display:block;margin-left:auto;margin-right:auto;filter:brightness(0) invert(1)}
</style>
</head>
<body>
<div class="wrap">
  <div class="nav">
    <img src="${LOGO}" alt="${companyName}" class="nav-logo" style="height:28px;width:auto;object-fit:contain;filter:brightness(0) invert(1);margin-right:10px">
    <span class="nav-label">${companyName}</span>
  </div>
  <div class="card">
    ${body}
    <div class="footer">
      <img src="${LOGO}" alt="${companyName}">
      © ${new Date().getFullYear()} ${companyName}${footerNote ? ` · ${footerNote}` : ''}
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── Proposal email ───────────────────────────────────────────
function proposalHtml({ proposal, proposalUrl, companyName }) {
  const amount = `$${Number(proposal.total_amount || 0).toLocaleString('en-AU', { minimumFractionDigits: 0 })}`;
  const validUntil = fmtDate(proposal.valid_until);

  const body = `
    <div class="hero">
      <div class="hero-glow"></div>
      <div class="hero-tag">Project Proposal</div>
      <h1>${proposal.title}</h1>
      <p>Prepared for <strong style="color:rgba(255,255,255,0.8)">${proposal.client_name || 'you'}</strong></p>
      <div class="hero-amount">
        <div class="hero-amount-label">Investment</div>
        ${amount}
      </div>
    </div>
    <div class="body">
      <p>Hi ${proposal.client_name || 'there'},</p>
      <p>Please find your proposal attached below. Click the button to review the full details and respond at your convenience.</p>
      <div class="meta">
        <div class="meta-row">
          <div class="meta-label">Project</div>
          <div class="meta-value">${proposal.title}</div>
        </div>
        <div class="meta-row">
          <div class="meta-label">Investment</div>
          <div class="meta-value">${amount} AUD</div>
        </div>
        ${validUntil !== 'on receipt' ? `<div class="meta-row"><div class="meta-label">Valid Until</div><div class="meta-value">${validUntil}</div></div>` : ''}
      </div>
      <div class="btn-wrap">
        <a href="${proposalUrl}" class="btn">Review Proposal →</a>
      </div>
      <div class="url-fallback">
        Or paste this link into your browser:<br>
        <a href="${proposalUrl}">${proposalUrl}</a>
      </div>
    </div>`;

  return layout({ body, companyName, footerNote: 'Crafted Technology for Real-World Results' });
}

// ── Invoice email ────────────────────────────────────────────
function invoiceHtml({ invoice, project, companyName, settings, isReminder }) {
  const amount = `$${fmtAmount(invoice.amount)}`;
  const dueDate = fmtDate(invoice.due_date);
  const projectTitle = project?.title || invoice.project_title || invoice.project_id || '—';

  const paymentSection = (settings?.bank_bsb || settings?.paypal_link || settings?.stripe_link) ? `
    <div class="payment-box">
      <h3>Payment Details</h3>
      ${settings.bank_bsb ? `<p><strong>Bank Transfer</strong>${settings.bank_name ? ` · ${settings.bank_name}` : ''} · BSB: <strong>${settings.bank_bsb}</strong> · Account: <strong>${settings.bank_account}</strong></p>` : ''}
      ${settings.paypal_link ? `<p><strong>PayPal / PayID:</strong> ${settings.paypal_link}</p>` : ''}
      ${settings.stripe_link ? `<p><strong>Stripe:</strong> ${settings.stripe_link}</p>` : ''}
      ${settings.payment_terms ? `<p style="margin-top:10px;font-size:12px;color:#6b7280">${settings.payment_terms}</p>` : ''}
    </div>` : '';

  const body = `
    <div class="hero">
      <div class="hero-glow"></div>
      <div class="hero-tag">${isReminder ? '⏰ Payment Reminder' : 'Tax Invoice'}</div>
      <h1>${invoice.invoice_number}</h1>
      <p>Billed to <strong style="color:rgba(255,255,255,0.8)">${invoice.client_name || 'you'}</strong>${invoice.stage ? ` · ${invoice.stage}` : ''}</p>
      <div class="hero-amount">
        <div class="hero-amount-label">Total Due</div>
        ${amount}
      </div>
    </div>
    <div class="body">
      <p>Hi ${invoice.client_name || 'there'},</p>
      <p>${isReminder
        ? `This is a friendly reminder that invoice <strong>${invoice.invoice_number}</strong> for <strong>${amount}</strong> is due <strong>${dueDate}</strong> and remains outstanding.`
        : `Please find your invoice below for <strong>${projectTitle}</strong>. Payment is due by <strong>${dueDate}</strong>.`
      }</p>
      <div class="meta">
        <div class="meta-row">
          <div class="meta-label">Invoice #</div>
          <div class="meta-value">${invoice.invoice_number}</div>
        </div>
        <div class="meta-row">
          <div class="meta-label">Project</div>
          <div class="meta-value">${projectTitle}</div>
        </div>
        ${invoice.stage ? `<div class="meta-row"><div class="meta-label">Stage</div><div class="meta-value">${invoice.stage}</div></div>` : ''}
        <div class="meta-row">
          <div class="meta-label">Amount</div>
          <div class="meta-value" style="font-weight:700;color:#06090A">${amount} AUD</div>
        </div>
        <div class="meta-row">
          <div class="meta-label">Due Date</div>
          <div class="meta-value" style="${isReminder ? 'color:#dc2626;font-weight:700' : ''}">${dueDate}</div>
        </div>
      </div>
      ${paymentSection}
      ${invoice.notes ? `<p style="font-size:12px;color:#6b7280;margin-top:16px">${invoice.notes}</p>` : ''}
    </div>`;

  return layout({ body, companyName, footerNote: settings?.invoice_footer || 'Please include the Invoice # as your payment reference' });
}

// ── Handler ──────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, to, proposal, proposalUrl, invoice, project, companyName, settings } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing recipient email' });

  const company = companyName || 'NEX-A Technology Solutions';

  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });
    let subject, html;

    if (type === 'proposal') {
      subject = `Proposal: ${proposal.title} — ${company}`;
      html = proposalHtml({ proposal, proposalUrl, companyName: company });

    } else if (type === 'invoice') {
      const isReminder = !!invoice.is_reminder;
      const amt = fmtAmount(invoice.amount);
      const due = fmtDate(invoice.due_date);
      subject = isReminder
        ? `Payment Reminder: ${invoice.invoice_number} — $${amt} due ${due}`
        : `Invoice ${invoice.invoice_number} — $${amt} due ${due} — ${company}`;
      html = invoiceHtml({ invoice, project, companyName: company, settings, isReminder });

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
