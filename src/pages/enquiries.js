import React, { useState, useEffect } from 'react';
import { ClientsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Mail, RefreshCw, Plus, User, Building, Phone, ChevronRight, CheckCircle } from 'lucide-react';

function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw.includes('T') ? raw : raw + 'T12:00:00');
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}

const TYPE_COLORS = {
  new_lead:        { label: 'New Lead',       badge: 'badge-green' },
  existing_client: { label: 'Existing Client', badge: 'badge-blue'  },
  referral:        { label: 'Referral',        badge: 'badge-purple' },
  support:         { label: 'Support',         badge: 'badge-yellow' },
  other:           { label: 'Other',           badge: 'badge-gray'  },
};

const SCAN_PERIODS = [
  { label: 'Last 30 days',   days: 30  },
  { label: 'Last 3 months',  days: 90  },
  { label: 'Last 6 months',  days: 180 },
  { label: 'Last 12 months', days: 365 },
];

export default function Enquiries() {
  const toast = useToast();
  const [enquiries, setEnquiries]   = useState([]);
  const [scanning, setScanning]     = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [period, setPeriod]         = useState(90);
  const [filter, setFilter]         = useState('all');
  const [adding, setAdding]         = useState(null); // msgId being added
  const [added, setAdded]           = useState(new Set()); // msgIds already added
  const [clients, setClients]       = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { ClientsAPI.list().then(setClients).catch(() => {}); }, []);

  async function scan() {
    setScanning(true);
    setEnquiries([]);
    try {
      const from = new Date(Date.now() - period * 86400000).toISOString();
      const res = await fetch('/api/inbox/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setEnquiries(data.results || []);
      setHasScanned(true);
      if (!data.results?.length) toast.success(`Scanned ${data.threads_found} emails — no enquiries found`);
      else toast.success(`Found ${data.results.length} enquir${data.results.length === 1 ? 'y' : 'ies'} from ${data.threads_found} emails`);
    } catch (err) { toast.error('Scan failed: ' + err.message); }
    setScanning(false);
  }

  async function addAsClient(eq) {
    setAdding(eq.msgId);
    try {
      // Check if email already exists
      const existing = clients.find(c => c.email?.toLowerCase() === eq.contact_email?.toLowerCase());
      if (existing) { toast.info(`Already a client — ${existing.name}`); setAdding(null); return; }

      const senderName = eq.contact_name || eq.sender.replace(/<.*>/, '').replace(/"/g, '').trim();
      await ClientsAPI.create({
        name: senderName,
        email: eq.contact_email || '',
        phone: eq.phone || '',
        company: eq.company || '',
        address: '',
        notes: `Enquiry (${eq.date}): ${eq.summary || eq.subject}`,
      });
      setAdded(prev => new Set([...prev, eq.msgId]));
      setClients(await ClientsAPI.list());
      toast.success(`Client added — ${senderName}`);
    } catch (err) { toast.error('Failed: ' + err.message); }
    setAdding(null);
  }

  const filtered = filter === 'all' ? enquiries : enquiries.filter(e => e.enquiry_type === filter);
  const counts = {};
  enquiries.forEach(e => { counts[e.enquiry_type] = (counts[e.enquiry_type] || 0) + 1; });

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Enquiries</h1>
          <p className="page-subtitle">Scan your inbox to find new leads and enquiries</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={period} onChange={e => setPeriod(Number(e.target.value))}
            style={{ marginBottom: 0, width: 'auto', minWidth: 140 }}>
            {SCAN_PERIODS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={scan} disabled={scanning}>
            {scanning
              ? <><RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Scanning...</>
              : <><Mail size={14} /> Scan Inbox</>}
          </button>
        </div>
      </div>

      {/* ── Not yet scanned ── */}
      {!hasScanned && !scanning && (
        <div className="card" style={{ padding: '56px 32px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Mail size={24} style={{ color: 'var(--accent-light)' }} />
          </div>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Scan your inbox for enquiries</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 400, margin: '0 auto 24px' }}>
            AI will scan your emails for new leads, referrals, and client enquiries — then let you add them as clients with one click.
          </p>
          <button className="btn btn-primary" onClick={scan}>
            <Mail size={14} /> Scan Last {period} Days
          </button>
        </div>
      )}

      {/* ── Scanning ── */}
      {scanning && (
        <div className="card" style={{ padding: '56px 32px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 20px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Scanning your inbox with AI — this may take a moment...</p>
        </div>
      )}

      {/* ── Results ── */}
      {hasScanned && !scanning && (
        <>
          {/* Filter tabs */}
          {enquiries.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter('all')}>All ({enquiries.length})</button>
              {Object.entries(counts).map(([type, count]) => (
                <button key={type} className={`btn btn-sm ${filter === type ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ textTransform: 'capitalize' }} onClick={() => setFilter(type)}>
                  {(TYPE_COLORS[type]?.label || type).replace('_', ' ')} ({count})
                </button>
              ))}
            </div>
          )}

          {/* Enquiry cards */}
          {filtered.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <p>{enquiries.length === 0 ? 'No enquiries found in this period.' : 'No enquiries match this filter.'}</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(eq => {
                const typeInfo = TYPE_COLORS[eq.enquiry_type] || TYPE_COLORS.other;
                const isAdded = added.has(eq.msgId);
                const isExpanded = expandedId === eq.msgId;
                const existingClient = clients.find(c => c.email?.toLowerCase() === eq.contact_email?.toLowerCase());

                return (
                  <div key={eq.msgId} className="card" style={{
                    padding: '20px 24px',
                    borderColor: isAdded ? 'var(--success)' : 'var(--border)',
                    opacity: isAdded ? 0.7 : 1,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>

                      {/* Avatar */}
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent-light)', fontWeight: 700, fontSize: 15 }}>
                        {(eq.contact_name || eq.sender || '?')[0].toUpperCase()}
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {eq.contact_name || eq.sender.replace(/<.*>/, '').trim()}
                          </span>
                          <span className={`badge ${typeInfo.badge}`}>{typeInfo.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {eq.confidence} confidence
                          </span>
                          {existingClient && (
                            <span className="badge badge-blue">Existing client</span>
                          )}
                        </div>

                        {/* Contact details */}
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                          {eq.contact_email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={11} />{eq.contact_email}</span>}
                          {eq.company && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Building size={11} />{eq.company}</span>}
                          {eq.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} />{eq.phone}</span>}
                          <span>{fmtDate(eq.date)}</span>
                        </div>

                        {/* Summary */}
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>
                          {eq.summary}
                        </p>

                        {/* Suggested action */}
                        {eq.suggested_action && (
                          <div style={{ fontSize: 12, color: 'var(--accent-light)', fontStyle: 'italic' }}>
                            → {eq.suggested_action}
                          </div>
                        )}

                        {/* Subject expand */}
                        <button onClick={() => setExpandedId(isExpanded ? null : eq.msgId)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ChevronRight size={12} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                          {isExpanded ? 'Hide' : 'Show'} subject line
                        </button>
                        {isExpanded && (
                          <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {eq.subject}
                          </div>
                        )}
                      </div>

                      {/* Action */}
                      <div style={{ flexShrink: 0 }}>
                        {isAdded ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 13, fontWeight: 500 }}>
                            <CheckCircle size={16} /> Added
                          </div>
                        ) : existingClient ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            <User size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            {existingClient.name}
                          </div>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={() => addAsClient(eq)} disabled={adding === eq.msgId}>
                            {adding === eq.msgId ? '...' : <><Plus size={12} /> Add Client</>}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
