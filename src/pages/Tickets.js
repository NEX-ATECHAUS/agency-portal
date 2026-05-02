import React, { useState, useEffect, useCallback } from 'react';
import { TicketsAPI, ClientsAPI, ProjectsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { RefreshCw, Mail, Plus, X, AlertCircle, Clock, CheckCircle, ChevronDown } from 'lucide-react';


function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw.includes('T') ? raw : raw + 'T12:00:00');
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}

const PRIORITY_STYLES = {
  urgent: { color: 'var(--danger)',  bg: 'var(--danger-dim)',  label: 'Urgent'  },
  high:   { color: '#f97316',        bg: 'rgba(249,115,22,0.1)', label: 'High'  },
  medium: { color: 'var(--warning)', bg: 'var(--warning-dim)', label: 'Medium' },
  low:    { color: 'var(--text-muted)', bg: 'var(--bg-tertiary)', label: 'Low'   },
};

const STATUS_STYLES = {
  open:        { color: 'var(--danger)',  badge: 'badge-red',    label: 'Open'        },
  in_progress: { color: 'var(--warning)', badge: 'badge-yellow', label: 'In Progress' },
  resolved:    { color: 'var(--success)', badge: 'badge-green',  label: 'Resolved'    },
  closed:      { color: 'var(--text-muted)', badge: 'badge-gray', label: 'Closed'     },
};

const PERIOD_OPTIONS = [
  { label: 'Last 7 days',   days: 7   },
  { label: 'Last 30 days',  days: 30  },
  { label: 'Last 3 months', days: 90  },
  { label: 'Last 6 months', days: 180 },
];

export default function Tickets() {
  const toast = useToast();
  const [tickets, setTickets]     = useState([]);
  const [clients, setClients]     = useState([]);
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [scanning, setScanning]   = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [approving, setApproving] = useState(null);
  const [filter, setFilter]       = useState('all');
  const [period, setPeriod]       = useState(30);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({
    subject: '', client_id: '', project_id: '', priority: 'medium',
    description: '', status: 'open',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c, p] = await Promise.all([TicketsAPI.list(), ClientsAPI.list(), ProjectsAPI.list()]);
      setTickets(t.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setClients(c); setProjects(p);
    } catch { toast.error('Failed to load tickets'); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  async function scanInbox() {
    setScanning(true);
    setScanResults(null);
    try {
      const from = new Date(Date.now() - period * 86400000).toISOString();
      const res = await fetch('/api/inbox/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setScanResults(data.results || []);
      if (!data.results?.length) toast.success(`Scanned ${data.threads_found} emails — no support tickets found`);
      else toast.success(`Found ${data.results.length} potential ticket${data.results.length !== 1 ? 's' : ''}`);
    } catch (err) { toast.error('Scan failed: ' + err.message); }
    setScanning(false);
  }

  async function approveTicket(result) {
    setApproving(result.msgId);
    try {
      const client = clients.find(c =>
        c.email?.toLowerCase() === result.client_email?.toLowerCase() ||
        (result.client_name && c.name?.toLowerCase().includes(result.client_name?.toLowerCase()))
      );
      const ticket = await TicketsAPI.create({
        subject: result.subject,
        client_id: client?.id || '',
        client_name: client?.name || result.client_name || '',
        project_id: '',
        project_title: '',
        status: 'open',
        priority: result.priority || 'medium',
        description: result.description,
        thread_id: result.threadId,
        sender_email: result.client_email || result.sender,
        assigned_to: '',
        resolved_at: '',
        notes: `Auto-imported from email: ${result.originalSubject}`,
        created_at: new Date().toISOString(),
      });
      setTickets(prev => [ticket, ...prev]);
      setScanResults(prev => prev.filter(r => r.msgId !== result.msgId));
      toast.success('Ticket created');
    } catch (err) { toast.error('Failed: ' + err.message); }
    setApproving(null);
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const client = clients.find(c => c.id === form.client_id);
      const project = projects.find(p => p.id === form.project_id);
      const ticket = await TicketsAPI.create({
        ...form,
        client_name: client?.name || '',
        project_title: project?.title || '',
        thread_id: '',
        sender_email: client?.email || '',
        assigned_to: '',
        resolved_at: '',
        notes: '',
        created_at: new Date().toISOString(),
      });
      setTickets(prev => [ticket, ...prev]);
      setShowCreate(false);
      setForm({ subject: '', client_id: '', project_id: '', priority: 'medium', description: '', status: 'open' });
      toast.success('Ticket created');
    } catch { toast.error('Failed to create ticket'); }
  }

  async function updateStatus(ticket, status) {
    try {
      const updated = await TicketsAPI.update(ticket.id, {
        ...ticket, status,
        resolved_at: (status === 'resolved' || status === 'closed') ? new Date().toISOString() : '',
      });
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
      toast.success(`Ticket ${status}`);
    } catch { toast.error('Failed to update'); }
  }

  const filtered = tickets.filter(t => filter === 'all' || t.status === filter);
  const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  tickets.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });

  if (loading) return <div className="loading-center" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Support Tickets</h1>
          <p className="page-subtitle">{tickets.length} total · {counts.open} open</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={period} onChange={e => setPeriod(Number(e.target.value))}
            style={{ marginBottom: 0, width: 'auto', minWidth: 130 }}>
            {PERIOD_OPTIONS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={scanInbox} disabled={scanning}>
            {scanning ? <><RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Scanning...</> : <><Mail size={14} /> Scan Inbox</>}
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Ticket
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {Object.entries(STATUS_STYLES).map(([key, s]) => (
          <div key={key} className="stat-card" style={{ cursor: 'pointer', borderColor: filter === key ? s.color : 'var(--border)' }}
            onClick={() => setFilter(f => f === key ? 'all' : key)}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 28 }}>{counts[key] || 0}</div>
          </div>
        ))}
      </div>

      {/* Scan results */}
      {scanResults !== null && scanResults.length > 0 && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>Inbox Scan Results</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{scanResults.length} potential ticket{scanResults.length !== 1 ? 's' : ''} — review and approve below</p>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setScanResults(null)}><X size={14} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scanResults.map(r => {
              const pri = PRIORITY_STYLES[r.priority] || PRIORITY_STYLES.medium;
              return (
                <div key={r.msgId} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${pri.color}`, borderRadius: 8, padding: '14px 16px', background: 'var(--bg-elevated)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <AlertCircle size={16} style={{ color: pri.color, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{r.subject}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{r.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                      <span>{r.client_name || r.sender}</span>
                      <span>{fmtDate(r.date)}</span>
                      <span style={{ color: pri.color, fontWeight: 600 }}>{pri.label}</span>
                      <span style={{ textTransform: 'capitalize' }}>{(r.category || '').replace('_', ' ')}</span>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => approveTicket(r)} disabled={approving === r.msgId}>
                    {approving === r.msgId ? '...' : <><Plus size={12} /> Add Ticket</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['all', 'All'], ...Object.entries(STATUS_STYLES).map(([k, v]) => [k, v.label])].map(([key, label]) => (
          <button key={key} className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
            style={{ textTransform: 'capitalize' }} onClick={() => setFilter(key)}>
            {label} {key !== 'all' && `(${counts[key] || 0})`}
          </button>
        ))}
      </div>

      {/* Tickets list */}
      {filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><p>{tickets.length === 0 ? 'No tickets yet. Scan your inbox or create one manually.' : 'No tickets match this filter.'}</p></div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(ticket => {
            const pri = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.medium;
            const st = STATUS_STYLES[ticket.status] || STATUS_STYLES.open;
            const isExpanded = expandedId === ticket.id;
            return (
              <div key={ticket.id} className="card" style={{ padding: '18px 24px', borderLeft: `3px solid ${pri.color}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{ticket.subject}</span>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pri.bg, color: pri.color }}>{pri.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: ticket.description ? 8 : 0 }}>
                      {ticket.client_name && <span>{ticket.client_name}</span>}
                      {ticket.project_title && <span>{ticket.project_title}</span>}
                      <span>{fmtDate(ticket.created_at)}</span>
                      {ticket.sender_email && <span>{ticket.sender_email}</span>}
                    </div>
                    {ticket.description && (
                      <div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, display: isExpanded ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {ticket.description}
                        </p>
                        {ticket.description.length > 120 && (
                          <button onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ChevronDown size={12} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'flex-end' }}>
                    {ticket.status === 'open' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(ticket, 'in_progress')}>
                        <Clock size={12} /> Start
                      </button>
                    )}
                    {(ticket.status === 'open' || ticket.status === 'in_progress') && (
                      <button className="btn btn-success btn-sm" onClick={() => updateStatus(ticket, 'resolved')}>
                        <CheckCircle size={12} /> Resolve
                      </button>
                    )}
                    {ticket.status === 'resolved' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(ticket, 'closed')}>
                        Close
                      </button>
                    )}
                    {ticket.resolved_at && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Resolved {fmtDate(ticket.resolved_at)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Ticket</h3>
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Subject *</label>
                  <input required value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief description of the issue" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Client</label>
                    <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value, project_id: '' }))}>
                      <option value="">Select client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Project</label>
                    <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                      <option value="">Select project...</option>
                      {projects.filter(p => !form.client_id || p.client_id === form.client_id).map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Priority</label>
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue in detail..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
