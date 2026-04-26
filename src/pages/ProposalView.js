import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProposalsAPI, ProjectsAPI, InvoicesAPI, NotificationsAPI, SettingsAPI } from '../services/sheets';
import { CheckCircle, XCircle, DollarSign, Calendar, FileText } from 'lucide-react';
import { format, addDays } from 'date-fns';

export default function ProposalView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [error, setError] = useState(null);

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
      // Update proposal
      await ProposalsAPI.update(id, { status: 'accepted', responded_at: new Date().toISOString() });

      // Create project
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

      // Create first invoice (Discovery - 15%)
      const paymentSchedule = typeof proposal.payment_schedule === 'object' 
        ? proposal.payment_schedule 
        : JSON.parse(proposal.payment_schedule || '[]');

      const firstPayment = paymentSchedule[0];
      const invoiceAmount = firstPayment
        ? (parseFloat(proposal.total_amount) * firstPayment.percentage / 100)
        : parseFloat(proposal.total_amount) * 0.5;

      const invoice = await InvoicesAPI.create({
        invoice_number: `INV-${Date.now()}`,
        project_id: project.id,
        project_title: project.title,
        client_id: proposal.client_id,
        client_name: proposal.client_name,
        client_email: proposal.client_email,
        stage: 'Discovery',
        stage_description: `Initial payment for ${proposal.title} — ${firstPayment?.milestone || 'Project Start'}`,
        amount: invoiceAmount,
        due_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
        status: 'sent',
      });

      // Send invoice email
      await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: proposal.client_email,
          subject: `Invoice ${invoice.invoice_number} — ${project.title}`,
          body: `Dear ${proposal.client_name},\n\nThank you for accepting our proposal!\n\nAn invoice for $${invoiceAmount.toLocaleString()} has been sent. Payment is due by ${invoice.due_date}.\n\nBest regards,\n${settings.company_name || 'Our Agency'}`,
          type: 'invoice',
        }),
      });

      // Create admin notification
      await NotificationsAPI.create({
        type: 'proposal_accepted',
        title: `Proposal accepted — ${proposal.title}`,
        message: `${proposal.client_name} accepted the proposal. Project and invoice created automatically.`,
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
    } catch (err) {
      alert('Something went wrong');
    } finally {
      setActing(null);
    }
  }

  const paymentSchedule = proposal ? (
    typeof proposal.payment_schedule === 'object' ? proposal.payment_schedule :
    (() => { try { return JSON.parse(proposal.payment_schedule || '[]'); } catch { return []; } })()
  ) : [];

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #e0e0e0', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: '#333', marginBottom: 8 }}>Proposal Not Found</h2>
        <p style={{ color: '#666' }}>{error}</p>
      </div>
    </div>
  );

  const isActed = proposal.status === 'accepted' || proposal.status === 'declined';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%)',
      padding: '40px 20px',
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: '#6c63ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: 'white', fontSize: 22, fontWeight: 800,
            fontFamily: 'Syne, sans-serif',
          }}>
            {(settings.company_name || 'A')[0]}
          </div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, color: '#1a1a2e', marginBottom: 6 }}>
            {settings.company_name || 'Agency Portal'}
          </h1>
          <p style={{ color: '#666', fontSize: 14 }}>Project Proposal</p>
        </div>

        {/* Status banner */}
        {isActed && (
          <div style={{
            padding: '14px 20px', borderRadius: 12, marginBottom: 24,
            background: proposal.status === 'accepted' ? '#d1fae5' : '#fee2e2',
            color: proposal.status === 'accepted' ? '#065f46' : '#991b1b',
            display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500,
          }}>
            {proposal.status === 'accepted' ? <CheckCircle size={18} /> : <XCircle size={18} />}
            This proposal has been {proposal.status}.
          </div>
        )}

        {/* Proposal card */}
        <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 4px 40px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          {/* Hero */}
          <div style={{ background: 'linear-gradient(135deg, #6c63ff, #8b84ff)', padding: '32px 40px', color: 'white' }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, marginBottom: 8 }}>{proposal.title}</h2>
            <p style={{ opacity: 0.85, fontSize: 14 }}>Prepared for {proposal.client_name}</p>
            <div style={{ display: 'flex', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DollarSign size={16} />
                <span style={{ fontSize: 22, fontWeight: 700 }}>${parseFloat(proposal.total_amount || 0).toLocaleString()}</span>
              </div>
              {proposal.valid_until && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.85 }}>
                  <Calendar size={15} />
                  <span style={{ fontSize: 14 }}>Valid until {proposal.valid_until}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '32px 40px' }}>
            {/* Scope */}
            {proposal.scope && (
              <Section title="Scope of Work" icon={<FileText size={18} color="#6c63ff" />}>
                <p style={{ color: '#444', lineHeight: 1.8, fontSize: 14 }}>{proposal.scope}</p>
              </Section>
            )}

            {/* Deliverables */}
            {proposal.deliverables && (
              <Section title="Deliverables">
                <p style={{ color: '#444', lineHeight: 1.8, fontSize: 14, whiteSpace: 'pre-line' }}>{proposal.deliverables}</p>
              </Section>
            )}

            {/* Timeline */}
            {proposal.timeline && (
              <Section title="Timeline">
                <p style={{ color: '#444', lineHeight: 1.8, fontSize: 14, whiteSpace: 'pre-line' }}>{proposal.timeline}</p>
              </Section>
            )}

            {/* Payment schedule */}
            {paymentSchedule.length > 0 && (
              <Section title="Payment Schedule">
                {paymentSchedule.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: 10,
                    background: i % 2 === 0 ? '#f8f9ff' : 'white',
                    marginBottom: 8, border: '1px solid #eef0f8',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{item.milestone}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{item.percentage}% of total</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#6c63ff' }}>
                      ${((parseFloat(proposal.total_amount) * item.percentage) / 100).toLocaleString()}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Terms */}
            {proposal.terms && (
              <Section title="Terms & Conditions">
                <p style={{ color: '#666', lineHeight: 1.8, fontSize: 13, whiteSpace: 'pre-line' }}>{proposal.terms}</p>
              </Section>
            )}

            {/* CTA buttons */}
            {!isActed && (
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
                <button
                  onClick={handleDecline}
                  disabled={!!acting}
                  style={{
                    padding: '14px 32px', borderRadius: 10, border: '2px solid #e0e0e0',
                    background: 'white', color: '#666', fontSize: 15, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
                  }}
                  onMouseOver={e => e.target.style.background = '#fef2f2'}
                  onMouseOut={e => e.target.style.background = 'white'}
                >
                  {acting === 'decline' ? 'Declining...' : 'Decline'}
                </button>
                <button
                  onClick={handleAccept}
                  disabled={!!acting}
                  style={{
                    padding: '14px 48px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #6c63ff, #8b84ff)',
                    color: 'white', fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.2s',
                    fontFamily: 'inherit',
                    boxShadow: '0 4px 20px rgba(108,99,255,0.4)',
                  }}
                  onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
                  onMouseOut={e => e.target.style.transform = 'none'}
                >
                  {acting === 'accept' ? 'Processing...' : '✓ Accept Proposal'}
                </button>
              </div>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#aaa' }}>
          © {new Date().getFullYear()} {settings.company_name || 'Agency Portal'} · {settings.email || ''}
        </p>
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {icon}
        <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}
