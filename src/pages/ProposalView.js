import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProposalsAPI, ProjectsAPI, InvoicesAPI, NotificationsAPI, SettingsAPI } from '../services/sheets';
import { format, addDays } from 'date-fns';

const BRAND = {
  black:      '#06090A',
  white:      '#ffffff',
  green:      '#c9fcd2',
  greenDeep:  '#98efb7',
  greenSoft:  '#e8ffef',
  muted:      '#6b7280',
  border:     '#e5e7eb',
  bg:         '#f3f4f6',
  ink:        '#06090A',
};

const LOGO = 'https://static.wixstatic.com/media/f71431_61430c2cad9d4aa3b3c60140cf727352~mv2.png';

export default function ProposalView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proposal, setProposal]   = useState(null);
  const [settings, setSettings]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState(null);
  const [error, setError]         = useState(null);

  useEffect(() => { loadData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    try {
      const [p, s] = await Promise.all([ProposalsAPI.get(id), SettingsAPI.getAll()]);
      if (!p) { setError('Proposal not found'); return; }
      setProposal(p);
      setSettings(s);
    } catch { setError('Failed to load proposal'); }
    finally { setLoading(false); }
  }

  async function handleAccept() {
    setActing('accept');
    try {
      await ProposalsAPI.update(id, { status: 'accepted', responded_at: new Date().toISOString() });

      const project = await ProjectsAPI.create({
        title: proposal.title,
        client_id: proposal.client_id,
        client_name: proposal.client_name,
        type: 'Web Development',
        status: 'active',
        current_stage: 'Discovery',
        stage_completion: {},
        total_fee: proposal.total_amount,
        description: proposal.scope,
      });

      const paymentSchedule = typeof proposal.payment_schedule === 'object'
        ? proposal.payment_schedule
        : (() => { try { return JSON.parse(proposal.payment_schedule || '[]'); } catch { return []; } })();

      const firstPayment = paymentSchedule[0];
      const invoiceAmount = firstPayment
        ? (parseFloat(proposal.total_amount) * firstPayment.percentage / 100)
        : parseFloat(proposal.total_amount) * 0.5;

      await InvoicesAPI.create({
        invoice_number: `INV-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        project_id: project.id,
        project_title: project.title,
        client_id: proposal.client_id,
        client_name: proposal.client_name,
        client_email: proposal.client_email,
        stage: 'Discovery',
        stage_description: `Initial payment — ${proposal.title}`,
        amount: invoiceAmount,
        due_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
        status: 'sent',
      });

      await NotificationsAPI.create({
        type: 'proposal_accepted',
        title: `Proposal accepted — ${proposal.title}`,
        message: `${proposal.client_name} accepted the proposal. Project created.`,
      });

      navigate('/thank-you');
    } catch (err) {
      alert('Something went wrong: ' + err.message);
      setActing(null);
    }
  }

  async function handleDecline() {
    setActing('decline');
    try {
      await ProposalsAPI.update(id, { status: 'declined', responded_at: new Date().toISOString() });
      await NotificationsAPI.create({
        type: 'proposal_declined',
        title: `Proposal declined — ${proposal.title}`,
        message: `${proposal.client_name} declined the proposal.`,
      });
      setProposal(prev => ({ ...prev, status: 'declined' }));
    } catch { alert('Something went wrong'); }
    finally { setActing(null); }
  }

  const paymentSchedule = proposal
    ? (typeof proposal.payment_schedule === 'object'
        ? proposal.payment_schedule
        : (() => { try { return JSON.parse(proposal.payment_schedule || '[]'); } catch { return []; } })())
    : [];

  const companyName = settings.company_name || 'NEX-A TECHNOLOGY SOLUTIONS';
  const totalAmount = parseFloat(proposal?.total_amount || 0);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.bg }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${BRAND.border}`, borderTopColor: BRAND.black, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.bg, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: BRAND.ink, marginBottom: 8 }}>Proposal Not Found</h2>
        <p style={{ color: BRAND.muted }}>{error}</p>
      </div>
    </div>
  );

  const isActed = proposal.status === 'accepted' || proposal.status === 'declined';

  return (
    <div style={{ minHeight: '100vh', background: BRAND.bg, fontFamily: "'Instrument Sans', system-ui, -apple-system, sans-serif", color: BRAND.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
      `}</style>

      {/* ── Top nav bar ── */}
      <div style={{ background: BRAND.black, padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={LOGO} alt="NEX-A" style={{ height: 36, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
            onError={e => { e.target.style.display = 'none'; }} />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {companyName}
          </span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Project Proposal</span>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px 80px', animation: 'fadeUp 0.4s ease' }}>

        {/* ── Status banner ── */}
        {isActed && (
          <div style={{
            padding: '14px 20px', borderRadius: 10, marginBottom: 24,
            background: proposal.status === 'accepted' ? BRAND.greenSoft : '#fee2e2',
            border: `1px solid ${proposal.status === 'accepted' ? BRAND.greenDeep : '#fca5a5'}`,
            color: proposal.status === 'accepted' ? '#065f46' : '#991b1b',
            fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>{proposal.status === 'accepted' ? '✓' : '✕'}</span>
            This proposal has been <strong>{proposal.status}</strong>.
          </div>
        )}

        {/* ── Hero card ── */}
        <div style={{ background: BRAND.black, borderRadius: 16, padding: '40px 44px', marginBottom: 3, overflow: 'hidden', position: 'relative' }}>
          {/* Green glow accent */}
          <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, background: BRAND.green, borderRadius: '50%', opacity: 0.08, pointerEvents: 'none' }} />

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: BRAND.green, marginBottom: 16 }}>
            Project Proposal
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: BRAND.white, lineHeight: 1.15, letterSpacing: '-0.5px', marginBottom: 12 }}>
            {proposal.title}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 32 }}>
            Prepared exclusively for <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{proposal.client_name}</strong>
          </p>

          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Investment</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: BRAND.green, letterSpacing: '-0.5px' }}>
                ${totalAmount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
              </div>
            </div>
            {proposal.valid_until && (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Valid Until</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                  {new Date(proposal.valid_until + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Content sections ── */}
        <div style={{ background: BRAND.white, borderRadius: '0 0 16px 16px', marginBottom: 3 }}>

          {/* Scope */}
          {proposal.scope && (
            <Section title="Scope of Work">
              <p style={{ color: '#444', lineHeight: 1.85, fontSize: 14, whiteSpace: 'pre-line' }}>{proposal.scope}</p>
            </Section>
          )}

          {/* Deliverables */}
          {proposal.deliverables && (
            <Section title="Deliverables">
              <p style={{ color: '#444', lineHeight: 1.85, fontSize: 14, whiteSpace: 'pre-line' }}>{proposal.deliverables}</p>
            </Section>
          )}

          {/* Timeline */}
          {proposal.timeline && (
            <Section title="Timeline">
              <p style={{ color: '#444', lineHeight: 1.85, fontSize: 14, whiteSpace: 'pre-line' }}>{proposal.timeline}</p>
            </Section>
          )}

          {/* Payment schedule */}
          {paymentSchedule.length > 0 && (
            <Section title="Payment Schedule">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {paymentSchedule.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 18px', borderRadius: 10,
                    background: i === 0 ? BRAND.greenSoft : BRAND.bg,
                    border: `1px solid ${i === 0 ? BRAND.greenDeep : BRAND.border}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink }}>{item.milestone}</div>
                      <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>{item.percentage}% of total project fee</div>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: BRAND.ink }}>
                      ${((totalAmount * item.percentage) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Terms */}
          {proposal.terms && (
            <Section title="Terms & Conditions" last>
              <p style={{ color: BRAND.muted, lineHeight: 1.85, fontSize: 13, whiteSpace: 'pre-line' }}>{proposal.terms}</p>
            </Section>
          )}
        </div>

        {/* ── CTA ── */}
        {!isActed && (
          <div style={{
            background: BRAND.white, borderRadius: 16, padding: '32px 44px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: BRAND.ink, marginBottom: 4 }}>Ready to get started?</div>
              <div style={{ fontSize: 13, color: BRAND.muted }}>Accept to confirm the project and receive your first invoice.</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleDecline} disabled={!!acting} style={{
                padding: '12px 24px', borderRadius: 999, border: `1px solid ${BRAND.border}`,
                background: 'transparent', color: BRAND.muted, fontSize: 14, fontWeight: 500,
                cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
                {acting === 'decline' ? 'Declining...' : 'Decline'}
              </button>
              <button onClick={handleAccept} disabled={!!acting} style={{
                padding: '12px 32px', borderRadius: 999, border: 'none',
                background: BRAND.black, color: BRAND.white,
                fontSize: 14, fontWeight: 600,
                cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
                opacity: acting ? 0.7 : 1,
              }}>
                {acting === 'accept' ? 'Processing...' : (
                  <><span style={{ color: BRAND.green, fontSize: 16 }}>✓</span> Accept Proposal</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', marginTop: 36, fontSize: 12, color: '#aaa' }}>
          <img src={LOGO} alt="NEX-A" style={{ height: 20, opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }}
            onError={e => { e.target.style.display = 'none'; }} />
          © {new Date().getFullYear()} {companyName}
          {settings.company_email && <> · {settings.company_email}</>}
          <br />
          <span style={{ fontSize: 11 }}>Crafted Technology for Real-World Results</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, last }) {
  return (
    <div style={{
      padding: '28px 44px',
      borderBottom: last ? 'none' : `1px solid ${BRAND.border}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
