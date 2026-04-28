import React, { useState, useEffect } from 'react';
import { ProposalsAPI, ClientsAPI, SettingsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Send, ExternalLink, X, Copy, Eye } from 'lucide-react';
import { format, addDays } from 'date-fns';

function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}

function fmt(n) {
  return Number(parseFloat(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Payment schedule presets from NEX-A payment terms ──────
const COMMERCIAL_TERMS = `Late Accounts: Interest 1.5%/month (or 10% p.a., lower applies). Work may pause after 7 days overdue.
GST: Prices exclude GST unless stated.
Expenses: Pre-approved, invoiced as incurred.
Change Requests: Variations quoted and approved before continuing.
Warranty: 30 days on defects in delivered scope.
IP & Access: IP transfers on final payment; limited licence until then. Credentials/environments remain under Nex-a control until all invoices are paid.`;

const SCHEDULE_PRESETS = {
  small: {
    label: 'Small (< $10k)',
    stages: [
      { name: 'Deposit on Acceptance', pct: 40, terms: 'Due on receipt' },
      { name: 'Feature-Complete',       pct: 40, terms: 'NET 7' },
      { name: 'Go-Live / Handover',     pct: 20, terms: 'Due on receipt' },
    ],
  },
  standard: {
    label: 'Standard ($10k – $50k)',
    stages: [
      { name: 'Deposit on Acceptance', pct: 30, terms: 'Due on receipt' },
      { name: 'Discovery / Solution',  pct: 30, terms: 'NET 7' },
      { name: 'Feature-Complete',      pct: 30, terms: 'NET 7' },
      { name: 'Go-Live / Handover',    pct: 10, terms: 'Due on receipt' },
    ],
  },
  large: {
    label: 'Large (> $50k)',
    stages: [
      { name: 'Deposit on Acceptance', pct: 20, terms: 'Due on receipt' },
      { name: 'Discovery / Solution',  pct: 25, terms: 'NET 7' },
      { name: 'Mid-Project Review',    pct: 25, terms: 'NET 7' },
      { name: 'Feature-Complete',      pct: 20, terms: 'NET 7' },
      { name: 'Go-Live / Handover',    pct: 10, terms: 'Due on receipt' },
    ],
  },
};

function autoPreset(amount) {
  const n = parseFloat(amount) || 0;
  if (n < 10000)  return 'small';
  if (n <= 50000) return 'standard';
  return 'large';
}

const STATUS_COLORS = {
  draft: 'badge-gray', sent: 'badge-blue',
  accepted: 'badge-green', declined: 'badge-red',
};
const STATUS_ICONS = {
  draft: '○', sent: '→', accepted: '✓', declined: '✕',
};

export default function Proposals() {
  const toast = useToast();
  const [proposals, setProposals]   = useState([]);
  const [clients, setClients]       = useState([]);
  const [settings, setSettings]     = useState({});
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [showModal, setShowModal]   = useState(false);
  const [sending, setSending]       = useState(null);
  const [selectedPreset, setSelectedPreset] = useState('standard');

  const blankForm = () => ({
    title: '', client_id: '', client_name: '', client_email: '',
    total_amount: '',
    scope: '', deliverables: '', timeline: '',
    terms: COMMERCIAL_TERMS,
    valid_until: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    payment_stages: SCHEDULE_PRESETS.standard.stages,
  });

  const [form, setForm] = useState(blankForm());

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [p, c, s] = await Promise.all([
        ProposalsAPI.list(), ClientsAPI.list(), SettingsAPI.getAll(),
      ]);
      setProposals(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setClients(c); setSettings(s);
    } catch { toast.error('Failed to load proposals'); }
    finally { setLoading(false); }
  }

  // Auto-select preset when amount changes
  function handleAmountChange(val) {
    const preset = autoPreset(val);
    setSelectedPreset(preset);
    setForm(f => ({ ...f, total_amount: val, payment_stages: SCHEDULE_PRESETS[preset].stages }));
  }

  function handlePresetChange(key) {
    setSelectedPreset(key);
    setForm(f => ({ ...f, payment_stages: SCHEDULE_PRESETS[key].stages }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const total = form.payment_stages.reduce((s, st) => s + Number(st.pct), 0);
    if (total !== 100) { toast.error(`Payment schedule must total 100% (currently ${total}%)`); return; }
    try {
      const client = clients.find(c => c.id === form.client_id);
      const proposal = await ProposalsAPI.create({
        ...form,
        client_name: client?.name || form.client_name,
        client_email: client?.email || form.client_email,
        payment_schedule: JSON.stringify(form.payment_stages.map(s => ({
          milestone: s.name, percentage: s.pct, terms: s.terms,
        }))),
        status: 'draft',
      });
      setProposals(prev => [proposal, ...prev]);
      setShowModal(false);
      setForm(blankForm());
      toast.success('Proposal created');
    } catch (err) { toast.error('Failed: ' + err.message); }
  }

  async function handleSend(proposal) {
    if (!proposal.client_email) { toast.error('No email for this client'); return; }
    setSending(proposal.id);
    try {
      const proposalUrl = `${window.location.origin}/proposal/${proposal.id}`;
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'proposal',
          to: proposal.client_email,
          proposal,
          proposalUrl,
          companyName: settings.company_name,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Email failed'); }
      const updated = await ProposalsAPI.update(proposal.id, { status: 'sent', sent_at: new Date().toISOString() });
      setProposals(prev => prev.map(p => p.id === updated.id ? updated : p));
      toast.success(`Sent to ${proposal.client_email}`);
    } catch (err) { toast.error('Failed: ' + err.message); }
    finally { setSending(null); }
  }

  function copyLink(proposal) {
    navigator.clipboard.writeText(`${window.location.origin}/proposal/${proposal.id}`);
    toast.success('Link copied!');
  }

  const filtered = proposals.filter(p => {
    const q = search.toLowerCase();
    return (!search || p.title?.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q))
      && (filter === 'all' || p.status === filter);
  });

  // Stats
  const countByStatus = s => proposals.filter(p => p.status === s).length;
  const totalAccepted = proposals.filter(p => p.status === 'accepted').reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);

  if (loading) return <div className="loading-center" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Proposals</h1>
          <p className="page-subtitle">{proposals.length} total · {countByStatus('accepted')} accepted</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(blankForm()); setShowModal(true); }}>
          <Plus size={15} /> New Proposal
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {[
          { label: 'Draft',    status: 'draft',    color: 'var(--text-muted)', val: countByStatus('draft') + ' proposals' },
          { label: 'Sent',     status: 'sent',     color: 'var(--info)',       val: countByStatus('sent') + ' awaiting' },
          { label: 'Accepted', status: 'accepted', color: 'var(--success)',    val: '$' + fmt(totalAccepted) },
          { label: 'Declined', status: 'declined', color: 'var(--danger)',     val: countByStatus('declined') + ' declined' },
        ].map(s => (
          <div key={s.status} className="stat-card"
            style={{ cursor: 'pointer', borderColor: filter === s.status ? s.color : 'var(--border)' }}
            onClick={() => setFilter(f => f === s.status ? 'all' : s.status)}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 20 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input placeholder="Search proposals..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'draft', 'sent', 'accepted', 'declined'].map(s => (
            <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
              style={{ textTransform: 'capitalize' }} onClick={() => setFilter(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Schedule</th>
                <th>Created</th>
                <th>Valid Until</th>
                <th style={{ minWidth: 200 }}>Status / Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state"><p>No proposals found</p></div></td></tr>
              ) : filtered.map(p => {
                const scheduleSize = (() => {
                  const amt = parseFloat(p.total_amount || 0);
                  if (amt < 10000) return { label: '< $10k', color: '#065f46', bg: '#d1fae5' };
                  if (amt <= 50000) return { label: '$10k–$50k', color: '#6d28d9', bg: '#ede9fe' };
                  return { label: '> $50k', color: '#b45309', bg: '#fef3c7' };
                })();
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.title}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.client_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.client_email}</div>
                    </td>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                      ${fmt(p.total_amount)}
                    </td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: scheduleSize.bg, color: scheduleSize.color }}>
                        {scheduleSize.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(p.created_at)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(p.valid_until)}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className={`badge ${STATUS_COLORS[p.status] || 'badge-gray'}`}>
                            {STATUS_ICONS[p.status]} {p.status || 'draft'}
                          </span>
                          {p.sent_at && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sent {fmtDate(p.sent_at)}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {(p.status === 'draft' || p.status === 'sent') && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleSend(p)} disabled={sending === p.id}>
                              <Send size={12} /> {sending === p.id ? '...' : p.status === 'sent' ? 'Resend' : 'Send'}
                            </button>
                          )}
                          <button className="btn btn-ghost btn-sm btn-icon" title="Copy link" onClick={() => copyLink(p)}>
                            <Copy size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon" title="Open proposal" onClick={() => window.open(`/proposal/${p.id}`, '_blank')}>
                            <ExternalLink size={13} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Proposal</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Proposal Title *</label>
                    <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Website Redesign Proposal" />
                  </div>
                  <div className="form-group">
                    <label>Client *</label>
                    <select required value={form.client_id} onChange={e => {
                      const c = clients.find(cl => cl.id === e.target.value);
                      setForm(f => ({ ...f, client_id: e.target.value, client_name: c?.name || '', client_email: c?.email || '' }));
                    }}>
                      <option value="">Select client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Total Amount (AUD) *</label>
                    <input type="number" required value={form.total_amount}
                      onChange={e => handleAmountChange(e.target.value)} placeholder="15000" />
                  </div>
                  <div className="form-group">
                    <label>Valid Until</label>
                    <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Scope of Work *</label>
                  <textarea required rows={3} value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} placeholder="Describe the scope of work..." />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Deliverables</label>
                    <textarea rows={3} value={form.deliverables} onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))} placeholder="List key deliverables..." />
                  </div>
                  <div className="form-group">
                    <label>Timeline</label>
                    <textarea rows={3} value={form.timeline} onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))} placeholder="e.g. 8 weeks from project start" />
                  </div>
                </div>

                {/* Payment schedule */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ margin: 0 }}>Payment Schedule</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {Object.entries(SCHEDULE_PRESETS).map(([key, val]) => (
                        <button key={key} type="button"
                          className={`btn btn-sm ${selectedPreset === key ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: 11 }}
                          onClick={() => handlePresetChange(key)}>
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 120px', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Milestone</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', textAlign: 'center' }}>%</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Terms</span>
                    </div>
                    {form.payment_stages.map((stage, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 120px', gap: 8, alignItems: 'center' }}>
                        <input value={stage.name} style={{ marginBottom: 0 }}
                          onChange={e => {
                            const s = [...form.payment_stages];
                            s[idx] = { ...s[idx], name: e.target.value };
                            setForm(f => ({ ...f, payment_stages: s }));
                          }} />
                        <input type="number" min="0" max="100" value={stage.pct} style={{ marginBottom: 0, textAlign: 'center' }}
                          onChange={e => {
                            const s = [...form.payment_stages];
                            s[idx] = { ...s[idx], pct: Number(e.target.value) };
                            setForm(f => ({ ...f, payment_stages: s }));
                          }} />
                        <select value={stage.terms} style={{ marginBottom: 0 }}
                          onChange={e => {
                            const s = [...form.payment_stages];
                            s[idx] = { ...s[idx], terms: e.target.value };
                            setForm(f => ({ ...f, payment_stages: s }));
                          }}>
                          <option>Due on receipt</option>
                          <option>NET 7</option>
                          <option>NET 14</option>
                          <option>NET 30</option>
                        </select>
                      </div>
                    ))}
                    <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700,
                      color: form.payment_stages.reduce((s, st) => s + Number(st.pct), 0) === 100 ? 'var(--success)' : 'var(--danger)' }}>
                      Total: {form.payment_stages.reduce((s, st) => s + Number(st.pct), 0)}%
                    </div>
                  </div>

                  {/* Amount preview */}
                  {parseFloat(form.total_amount) > 0 && (
                    <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                        {form.payment_stages.map((s, i) => (
                          <span key={i} style={{ color: 'var(--text-secondary)' }}>
                            {s.name}: <strong style={{ color: 'var(--text-primary)' }}>
                              ${((parseFloat(form.total_amount) * s.pct) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                            </strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Terms & Conditions</label>
                  <textarea rows={5} value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Proposal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
