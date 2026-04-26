import React, { useState, useEffect } from 'react';
import { ProposalsAPI, ClientsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Send, ExternalLink, X, Copy } from 'lucide-react';
import { format, addDays } from 'date-fns';

const STATUS_COLORS = { draft: 'badge-muted', sent: 'badge-info', accepted: 'badge-success', declined: 'badge-danger' };

export default function Proposals() {
  const toast = useToast();
  const [proposals, setProposals] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState(null);
  const [form, setForm] = useState({
    title: '', client_id: '', client_name: '', client_email: '',
    total_amount: '', scope: '', deliverables: '', timeline: '',
    terms: 'Payment terms: 50% upfront, 50% on completion. All work is subject to our standard terms and conditions.',
    valid_until: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    payment_schedule: JSON.stringify([
      { milestone: 'Project Start', percentage: 50 },
      { milestone: 'Project Completion', percentage: 50 },
    ]),
  });

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([ProposalsAPI.list(), ClientsAPI.list()]);
      setProposals(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setClients(c);
    } catch { toast.error('Failed to load proposals'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const client = clients.find(c => c.id === form.client_id);
      const proposal = await ProposalsAPI.create({
        ...form,
        client_name: client?.name || form.client_name,
        client_email: client?.email || form.client_email,
        payment_schedule: JSON.parse(form.payment_schedule),
      });
      setProposals(prev => [proposal, ...prev]);
      setShowModal(false);
      toast.success('Proposal created');
    } catch (err) { toast.error('Failed to create: ' + err.message); }
  }

  async function handleSend(proposal) {
    setSending(proposal.id);
    try {
      const proposalUrl = `${window.location.origin}/proposal/${proposal.id}`;
      const subject = `Proposal: ${proposal.title}`;
      const body = `Dear ${proposal.client_name},\n\nPlease find your proposal at the link below:\n${proposalUrl}\n\nThis proposal is valid until ${proposal.valid_until}.\n\nBest regards`;

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: proposal.client_email, subject, body, type: 'proposal' }),
      });

      if (!res.ok) throw new Error('Email failed');

      const updated = await ProposalsAPI.update(proposal.id, { status: 'sent', sent_at: new Date().toISOString() });
      setProposals(prev => prev.map(p => p.id === updated.id ? updated : p));
      toast.success(`Proposal sent to ${proposal.client_email}`);
    } catch (err) {
      toast.error('Failed to send: ' + err.message);
    } finally {
      setSending(null);
    }
  }

  function copyLink(proposal) {
    const url = `${window.location.origin}/proposal/${proposal.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied!');
  }

  const filtered = proposals.filter(p => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || (p.client_name || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || p.status === filter;
    return matchSearch && matchFilter;
  });

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Proposals</h1>
          <p className="page-subtitle">{proposals.length} total proposals</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Proposal
        </button>
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <Search size={14} />
          <input placeholder="Search proposals..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['all', 'draft', 'sent', 'accepted', 'declined'].map(s => (
          <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Valid Until</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state"><p>No proposals found</p></div></td></tr>
              ) : filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.title}</td>
                  <td>
                    <div>{p.client_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.client_email}</div>
                  </td>
                  <td>${parseFloat(p.total_amount || 0).toLocaleString()}</td>
                  <td><span className={`badge ${STATUS_COLORS[p.status] || 'badge-muted'}`}>{p.status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.valid_until}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {p.status === 'draft' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSend(p)}
                          disabled={sending === p.id}
                        >
                          <Send size={12} /> {sending === p.id ? 'Sending...' : 'Send'}
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => copyLink(p)} title="Copy link">
                        <Copy size={12} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => window.open(`/proposal/${p.id}`, '_blank')} title="Preview">
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Proposal</h2>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Proposal Title *</label>
                  <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="E.g. Website Redesign Proposal" />
                </div>
                <div className="form-group">
                  <label>Client *</label>
                  <select value={form.client_id} onChange={e => {
                    const c = clients.find(cl => cl.id === e.target.value);
                    setForm(f => ({ ...f, client_id: e.target.value, client_name: c?.name || '', client_email: c?.email || '' }));
                  }} required>
                    <option value="">Select client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Total Amount ($) *</label>
                  <input type="number" required value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="15000" />
                </div>
                <div className="form-group">
                  <label>Valid Until</label>
                  <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Scope of Work *</label>
                <textarea required rows={4} value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} placeholder="Describe the scope of work..." />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Deliverables</label>
                  <textarea rows={3} value={form.deliverables} onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))} placeholder="List key deliverables..." />
                </div>
                <div className="form-group">
                  <label>Timeline</label>
                  <textarea rows={3} value={form.timeline} onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))} placeholder="Project timeline..." />
                </div>
              </div>
              <div className="form-group">
                <label>Payment Schedule (JSON)</label>
                <textarea rows={3} value={form.payment_schedule} onChange={e => setForm(f => ({ ...f, payment_schedule: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Terms & Conditions</label>
                <textarea rows={3} value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} />
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
