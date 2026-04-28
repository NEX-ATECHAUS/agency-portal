import React, { useState, useEffect } from 'react';
import { ProposalsAPI, ClientsAPI, SettingsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Send, ExternalLink, X, Copy, ChevronRight } from 'lucide-react';
import { format, addDays } from 'date-fns';

function fmtDate(raw) {
  if (!raw || raw === '' || raw === 'undefined' || raw === 'null') return '—';
  try {
    const str = String(raw).trim();
    // Handle yyyy-MM-dd and ISO strings
    const d = new Date(str.includes('T') ? str : str + 'T12:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function fmt(n) {
  return Number(parseFloat(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const COMMERCIAL_TERMS = `Late Accounts: Interest 1.5%/month (or 10% p.a., lower applies). Work may pause after 7 days overdue.
GST: Prices exclude GST unless stated.
Expenses: Pre-approved, invoiced as incurred.
Change Requests: Variations quoted and approved before continuing.
Warranty: 30 days on defects in delivered scope.
IP & Access: IP transfers on final payment; limited licence until then. Credentials/environments remain under Nex-a control until all invoices are paid.`;

const SCHEDULE_PRESETS = {
  small:    { label: '< $10k',      stages: [{ name: 'Deposit on Acceptance', pct: 40, terms: 'Due on receipt' }, { name: 'Feature-Complete', pct: 40, terms: 'NET 7' }, { name: 'Go-Live / Handover', pct: 20, terms: 'Due on receipt' }] },
  standard: { label: '$10k–$50k',   stages: [{ name: 'Deposit on Acceptance', pct: 30, terms: 'Due on receipt' }, { name: 'Discovery / Solution', pct: 30, terms: 'NET 7' }, { name: 'Feature-Complete', pct: 30, terms: 'NET 7' }, { name: 'Go-Live / Handover', pct: 10, terms: 'Due on receipt' }] },
  large:    { label: '> $50k',      stages: [{ name: 'Deposit on Acceptance', pct: 20, terms: 'Due on receipt' }, { name: 'Discovery / Solution', pct: 25, terms: 'NET 7' }, { name: 'Mid-Project Review', pct: 25, terms: 'NET 7' }, { name: 'Feature-Complete', pct: 20, terms: 'NET 7' }, { name: 'Go-Live / Handover', pct: 10, terms: 'Due on receipt' }] },
};

function autoPreset(amount) {
  const n = parseFloat(amount) || 0;
  if (n < 10000) return 'small';
  if (n <= 50000) return 'standard';
  return 'large';
}

const STATUS = {
  draft:    { color: 'var(--text-muted)',  bg: 'var(--bg-elevated)',  label: 'Draft'    },
  sent:     { color: 'var(--info)',        bg: 'var(--info-dim)',     label: 'Sent'     },
  accepted: { color: 'var(--success)',     bg: 'var(--success-dim)', label: 'Accepted' },
  declined: { color: 'var(--danger)',      bg: 'var(--danger-dim)',  label: 'Declined' },
};

const SIZE_TAG = {
  small:    { label: '< $10k',    color: '#065f46', bg: '#d1fae5' },
  standard: { label: '$10k–$50k', color: '#6d28d9', bg: '#ede9fe' },
  large:    { label: '> $50k',    color: '#b45309', bg: '#fef3c7' },
};

export default function Proposals() {
  const toast = useToast();
  const [proposals, setProposals] = useState([]);
  const [clients, setClients]     = useState([]);
  const [settings, setSettings]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending]     = useState(null);
  const [preset, setPreset]       = useState('standard');

  const blankForm = () => ({
    title: '', client_id: '', client_name: '', client_email: '',
    total_amount: '', scope: '', deliverables: '', timeline: '',
    terms: COMMERCIAL_TERMS,
    valid_until: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    payment_stages: SCHEDULE_PRESETS.standard.stages,
  });
  const [form, setForm] = useState(blankForm());

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [p, c, s] = await Promise.all([ProposalsAPI.list(), ClientsAPI.list(), SettingsAPI.getAll()]);
      setProposals(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setClients(c); setSettings(s);
    } catch { toast.error('Failed to load proposals'); }
    finally { setLoading(false); }
  }

  function handleAmountChange(val) {
    const p = autoPreset(val);
    setPreset(p);
    setForm(f => ({ ...f, total_amount: val, payment_stages: SCHEDULE_PRESETS[p].stages }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const total = form.payment_stages.reduce((s, st) => s + Number(st.pct), 0);
    if (total !== 100) { toast.error(`Schedule must total 100% (currently ${total}%)`); return; }
    try {
      const client = clients.find(c => c.id === form.client_id);
      const proposal = await ProposalsAPI.create({
        ...form,
        client_name: client?.name || '',
        client_email: client?.email || '',
        payment_schedule: JSON.stringify(form.payment_stages.map(s => ({ milestone: s.name, percentage: s.pct, terms: s.terms }))),
        status: 'draft',
      });
      setProposals(prev => [proposal, ...prev]);
      setShowModal(false);
      setForm(blankForm());
      toast.success('Proposal created');
    } catch (err) { toast.error('Failed: ' + err.message); }
  }

  async function handleSend(proposal) {
    if (!proposal.client_email) { toast.error('No email on file for this client'); return; }
    setSending(proposal.id);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'proposal', to: proposal.client_email, proposal, proposalUrl: `${window.location.origin}/proposal/${proposal.id}`, companyName: settings.company_name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Email failed');
      const updated = await ProposalsAPI.update(proposal.id, { status: 'sent', sent_at: new Date().toISOString() });
      setProposals(prev => prev.map(p => p.id === updated.id ? updated : p));
      toast.success(`Sent to ${proposal.client_email}`);
    } catch (err) { toast.error(err.message); }
    finally { setSending(null); }
  }

  function copyLink(id) {
    navigator.clipboard.writeText(`${window.location.origin}/proposal/${id}`);
    toast.success('Link copied!');
  }

  const filtered = proposals.filter(p =>
    (!search || [p.title, p.client_name].some(v => (v||'').toLowerCase().includes(search.toLowerCase())))
    && (filter === 'all' || p.status === filter)
  );

  const totalAccepted = proposals.filter(p => p.status === 'accepted').reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);

  if (loading) return <div className="loading-center" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Proposals</h1>
          <p className="page-subtitle">{proposals.length} total · {proposals.filter(p => p.status === 'accepted').length} accepted</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(blankForm()); setShowModal(true); }}>
          <Plus size={15} /> New Proposal
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid">
        {[
          { label: 'Draft',    key: 'draft',    color: 'var(--text-muted)', val: proposals.filter(p => p.status === 'draft').length    },
          { label: 'Sent',     key: 'sent',     color: 'var(--info)',       val: proposals.filter(p => p.status === 'sent').length     },
          { label: 'Accepted', key: 'accepted', color: 'var(--success)',    val: '$' + fmt(totalAccepted)                              },
          { label: 'Declined', key: 'declined', color: 'var(--danger)',     val: proposals.filter(p => p.status === 'declined').length },
        ].map(s => (
          <div key={s.key} className="stat-card" style={{ cursor: 'pointer', borderColor: filter === s.key ? s.color : 'var(--border)' }}
            onClick={() => setFilter(f => f === s.key ? 'all' : s.key)}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 22 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Search + filter ── */}
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

      {/* ── Proposal cards ── */}
      {filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><p>No proposals found</p></div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(p => {
            const st = STATUS[p.status] || STATUS.draft;
            const sizeKey = autoPreset(p.total_amount);
            const sizeTag = SIZE_TAG[sizeKey];
            return (
              <div key={p.id} className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                {/* Status strip */}
                <div style={{ width: 4, height: 48, borderRadius: 99, background: st.color, flexShrink: 0, alignSelf: 'stretch' }} />

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{p.title}</span>
                    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: sizeTag.bg, color: sizeTag.color }}>
                      {sizeTag.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>{p.client_name}</span>
                    {p.sent_at && fmtDate(p.sent_at) !== '—' && <span>Sent {fmtDate(p.sent_at)}</span>}
                    {fmtDate(p.valid_until) !== '—' && <span>Valid until {fmtDate(p.valid_until)}</span>}
                    {fmtDate(p.created_at) !== '—' && <span>Created {fmtDate(p.created_at)}</span>}
                  </div>
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                    ${fmt(p.total_amount)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>AUD</div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {(p.status === 'draft' || p.status === 'sent') && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleSend(p)} disabled={sending === p.id}>
                      <Send size={12} /> {sending === p.id ? 'Sending...' : p.status === 'sent' ? 'Resend' : 'Send'}
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm btn-icon" title="Copy link" onClick={() => copyLink(p.id)}>
                    <Copy size={13} />
                  </button>
                  <button className="btn btn-secondary btn-sm btn-icon" title="Open proposal" onClick={() => window.open(`/proposal/${p.id}`, '_blank')}>
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Proposal</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">

                {/* Title + client */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Title *</label>
                    <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Website Redesign" />
                  </div>
                  <div className="form-group">
                    <label>Client *</label>
                    <select required value={form.client_id} onChange={e => {
                      const c = clients.find(cl => cl.id === e.target.value);
                      setForm(f => ({ ...f, client_id: e.target.value, client_name: c?.name || '', client_email: c?.email || '' }));
                    }}>
                      <option value="">Select client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>)}
                    </select>
                  </div>
                </div>

                {/* Amount + valid until */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Total Amount (AUD) *</label>
                    <input type="number" required value={form.total_amount} onChange={e => handleAmountChange(e.target.value)} placeholder="15000" />
                  </div>
                  <div className="form-group">
                    <label>Valid Until</label>
                    <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
                  </div>
                </div>

                {/* Scope */}
                <div className="form-group">
                  <label>Scope of Work *</label>
                  <textarea required rows={3} value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} placeholder="Describe the scope..." />
                </div>

                {/* Deliverables + timeline */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Deliverables</label>
                    <textarea rows={3} value={form.deliverables} onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))} placeholder="Key deliverables..." />
                  </div>
                  <div className="form-group">
                    <label>Timeline</label>
                    <textarea rows={3} value={form.timeline} onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))} placeholder="e.g. 8 weeks from start" />
                  </div>
                </div>

                {/* Payment schedule */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Payment Schedule</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Auto-selected by amount · editable</div>
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {Object.entries(SCHEDULE_PRESETS).map(([key, val]) => (
                        <button key={key} type="button"
                          className={`btn btn-sm ${preset === key ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => { setPreset(key); setForm(f => ({ ...f, payment_stages: val.stages })); }}>
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 110px', gap: 8, marginBottom: 8 }}>
                    {['Milestone', '%', 'Terms'].map(h => (
                      <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>{h}</span>
                    ))}
                  </div>
                  {form.payment_stages.map((stage, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 110px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input value={stage.name} style={{ marginBottom: 0 }} onChange={e => {
                        const s = [...form.payment_stages]; s[idx] = { ...s[idx], name: e.target.value };
                        setForm(f => ({ ...f, payment_stages: s }));
                      }} />
                      <input type="number" min="0" max="100" value={stage.pct} style={{ marginBottom: 0, textAlign: 'center' }} onChange={e => {
                        const s = [...form.payment_stages]; s[idx] = { ...s[idx], pct: Number(e.target.value) };
                        setForm(f => ({ ...f, payment_stages: s }));
                      }} />
                      <select value={stage.terms} style={{ marginBottom: 0 }} onChange={e => {
                        const s = [...form.payment_stages]; s[idx] = { ...s[idx], terms: e.target.value };
                        setForm(f => ({ ...f, payment_stages: s }));
                      }}>
                        <option>Due on receipt</option>
                        <option>NET 7</option>
                        <option>NET 14</option>
                        <option>NET 30</option>
                      </select>
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: form.payment_stages.reduce((s, st) => s + Number(st.pct), 0) === 100 ? 'var(--success)' : 'var(--danger)' }}>
                      {form.payment_stages.reduce((s, st) => s + Number(st.pct), 0)}% total
                    </div>
                    {parseFloat(form.total_amount) > 0 && (
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {form.payment_stages.map((s, i) => (
                          <span key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {s.name.split(' ')[0]}: <strong style={{ color: 'var(--text-primary)' }}>
                              ${((parseFloat(form.total_amount) * s.pct) / 100).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                            </strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Terms */}
                <div className="form-group">
                  <label>Terms & Conditions</label>
                  <textarea rows={4} value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} />
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  Create Proposal <ChevronRight size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
