import React, { useState, useEffect, useRef } from 'react';
import { InvoicesAPI, ClientsAPI, ProjectsAPI, SettingsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Send, CheckSquare, X, Eye, Bell, Trash2 } from 'lucide-react';
import { format, addDays } from 'date-fns';

// ── Helpers ────────────────────────────────────────────────
function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}

function fmt(n) {
  return Number(parseFloat(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextInvoiceNumber(invoices) {
  const nums = invoices.map(i => parseInt((i.invoice_number || '').replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
  return `INV-${String(nums.length ? Math.max(...nums) + 1 : 1001).padStart(4, '0')}`;
}

function parseLineItems(raw, fallbackAmount, fallbackDesc) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  if (fallbackAmount && parseFloat(fallbackAmount) > 0) {
    return [{ description: fallbackDesc || 'Professional Services', amount: parseFloat(fallbackAmount) }];
  }
  return [];
}

function parseStages(raw) {
  if (!raw) return null;
  if (Array.isArray(raw) && raw.length > 0) return raw;
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p) && p.length > 0) return p;
  } catch {}
  return null;
}

const STATUS_COLORS = {
  draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green', overdue: 'badge-red',
};

// ── Main component ─────────────────────────────────────────
export default function Invoices() {
  const toast = useToast();
  const [invoices, setInvoices]   = useState([]);
  const [clients, setClients]     = useState([]);
  const [projects, setProjects]   = useState([]);
  const [settings, setSettings]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [preview, setPreview]     = useState(null);
  const [editing, setEditing]     = useState(null);
  const [sendingId, setSendingId] = useState(null);

  const emptyForm = (allInv = invoices) => ({
    invoice_number: nextInvoiceNumber(allInv),
    project_id: '', project_title: '',
    client_id: '', client_name: '', client_email: '', client_address: '',
    stage: '',
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    charge_gst: false,   // ← OFF by default
    notes: '',
    line_items: [{ description: '', amount: '' }],
  });

  const [form, setForm] = useState(emptyForm([]));

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [inv, c, p, s] = await Promise.all([
        InvoicesAPI.list(), ClientsAPI.list(), ProjectsAPI.list(), SettingsAPI.getAll(),
      ]);
      setInvoices(inv.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setClients(c); setProjects(p); setSettings(s);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }

  // ── Line item helpers ──────────────────────────────────
  function addLineItem() {
    setForm(f => ({ ...f, line_items: [...f.line_items, { description: '', amount: '' }] }));
  }
  function removeLineItem(idx) {
    setForm(f => ({ ...f, line_items: f.line_items.filter((_, i) => i !== idx) }));
  }
  function updateLineItem(idx, key, val) {
    setForm(f => {
      const items = [...f.line_items];
      items[idx] = { ...items[idx], [key]: val };
      return { ...f, line_items: items };
    });
  }
  function calcTotals(items, chargeGst) {
    const subtotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const gst = chargeGst ? subtotal * 0.1 : 0;
    return { subtotal, gst, total: subtotal + gst };
  }

  // ── Project / client select ────────────────────────────
  function handleProjectChange(pid) {
    const p = projects.find(pr => pr.id === pid);
    if (!p) { setForm(f => ({ ...f, project_id: pid, project_title: '' })); return; }
    const client = clients.find(c => c.id === p.client_id);
    const stages = parseStages(p.payment_stages);
    const currentStage = p.current_stage || stages?.[0]?.name || '';
    const fee = parseFloat(p.total_fee) || 0;
    const stageObj = stages?.find(s => s.name === currentStage);
    const stageAmount = fee > 0 && stageObj ? ((fee * Number(stageObj.pct)) / 100).toFixed(2) : null;
    setForm(f => ({
      ...f,
      project_id: pid, project_title: p.title,
      client_id: p.client_id || f.client_id,
      client_name: client?.name || f.client_name,
      client_email: client?.email || f.client_email,
      client_address: client?.address || f.client_address,
      stage: currentStage,
      line_items: stageAmount
        ? [{ description: `${currentStage} phase — ${p.title}`, amount: stageAmount }]
        : f.line_items,
    }));
  }

  function handleClientChange(cid) {
    const c = clients.find(cl => cl.id === cid);
    setForm(f => ({
      ...f, client_id: cid,
      client_name: c?.name || '',
      client_email: c?.email || '',
      client_address: c?.address || '',
    }));
  }

  function handleStageSelect(stageName) {
    const p = projects.find(pr => pr.id === form.project_id);
    const stages = p ? parseStages(p.payment_stages) : null;
    const fee = parseFloat(p?.total_fee) || 0;
    const stageObj = stages?.find(s => s.name === stageName);
    const stageAmount = fee > 0 && stageObj ? ((fee * Number(stageObj.pct)) / 100).toFixed(2) : null;
    setForm(f => ({
      ...f, stage: stageName,
      line_items: stageAmount
        ? [{ description: `${stageName} phase — ${p.title}`, amount: stageAmount }]
        : f.line_items,
    }));
  }

  // ── Open modals ────────────────────────────────────────
  function openCreate() {
    setForm(emptyForm(invoices));
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(inv) {
    const line_items = parseLineItems(inv.line_items, inv.amount, inv.stage_description);
    setForm({
      invoice_number: inv.invoice_number || '',
      project_id: inv.project_id || '', project_title: inv.project_title || '',
      client_id: inv.client_id || '', client_name: inv.client_name || '',
      client_email: inv.client_email || '', client_address: inv.client_address || '',
      stage: inv.stage || '',
      due_date: inv.due_date || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      charge_gst: inv.charge_gst === 'true' || inv.charge_gst === true,
      notes: inv.notes || '',
      line_items: line_items.length ? line_items : [{ description: '', amount: '' }],
    });
    setEditing(inv);
    setShowModal(true);
  }

  // ── Save ───────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault();
    const { total } = calcTotals(form.line_items, form.charge_gst);
    const payload = {
      ...form,
      line_items: JSON.stringify(form.line_items),
      amount: total,
      stage_description: form.line_items.map(i => i.description).filter(Boolean).join('; '),
    };
    try {
      if (editing) {
        const updated = await InvoicesAPI.update(editing.id, payload);
        setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
        toast.success('Invoice updated');
      } else {
        const inv = await InvoicesAPI.create(payload);
        setInvoices(prev => [inv, ...prev]);
        toast.success('Invoice created');
      }
      setShowModal(false);
    } catch { toast.error('Failed to save invoice'); }
  }

  // ── Send / remind ──────────────────────────────────────
  async function handleSend(invoice, isReminder = false) {
    const resolvedEmail = invoice.client_email ||
      clients.find(c => c.id === invoice.client_id)?.email || '';
    if (!resolvedEmail || !resolvedEmail.includes('@')) {
      toast.error('No valid email for this client. Edit the invoice to add one.');
      return;
    }
    setSendingId(isReminder ? `r-${invoice.id}` : invoice.id);
    try {
      const project = projects.find(p => p.id === invoice.project_id);
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice', to: resolvedEmail,
          invoice: { ...invoice, client_email: resolvedEmail, is_reminder: isReminder },
          project, companyName: settings.company_name, settings,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Email failed'); }
      if (!isReminder) {
        const updated = await InvoicesAPI.update(invoice.id, { ...invoice, client_email: resolvedEmail, status: 'sent', sent_at: new Date().toISOString() });
        setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      }
      toast.success(isReminder ? 'Reminder sent!' : 'Invoice sent!');
    } catch (err) { toast.error(err.message || 'Failed to send'); }
    finally { setSendingId(null); }
  }

  // ── Mark paid ──────────────────────────────────────────
  async function handleMarkPaid(invoice) {
    try {
      const now = new Date().toISOString();
      const updated = await InvoicesAPI.update(invoice.id, { ...invoice, status: 'paid', paid_at: now });
      setInvoices(prev => prev.map(i => i.id === updated.id ? { ...updated, status: 'paid', paid_at: now } : i));
      toast.success('Marked as paid ✓');
    } catch (err) { toast.error('Failed: ' + err.message); }
  }

  const filtered = invoices.filter(i => {
    const q = search.toLowerCase();
    return (!search || [i.invoice_number, i.client_name, i.project_title].some(v => (v || '').toLowerCase().includes(q)))
      && (filter === 'all' || i.status === filter);
  });

  const totalByStatus = s => invoices.filter(i => i.status === s).reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

  if (loading) return <div className="loading-center" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{invoices.length} total · {invoices.filter(i => i.status === 'paid').length} paid</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> New Invoice</button>
      </div>

      {/* ── Stat cards ── */}
      <div className="stat-grid">
        {[
          { label: 'Draft',   status: 'draft',   color: 'var(--text-muted)' },
          { label: 'Sent',    status: 'sent',    color: 'var(--info)' },
          { label: 'Paid',    status: 'paid',    color: 'var(--success)' },
          { label: 'Overdue', status: 'overdue', color: 'var(--danger)' },
        ].map(s => (
          <div key={s.status} className="stat-card"
            style={{ cursor: 'pointer', borderColor: filter === s.status ? s.color : 'var(--border)' }}
            onClick={() => setFilter(f => f === s.status ? 'all' : s.status)}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 22 }}>${fmt(totalByStatus(s.status))}</div>
            <div className="stat-sub">{invoices.filter(i => i.status === s.status).length} invoice{invoices.filter(i => i.status === s.status).length !== 1 ? 's' : ''}</div>
          </div>
        ))}
      </div>

      {/* ── Search + filter ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input placeholder="Search by client, project or number..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'draft', 'sent', 'paid', 'overdue'].map(s => (
            <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
              style={{ textTransform: 'capitalize' }} onClick={() => setFilter(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Project / Stage</th>
                <th>Amount</th>
                <th>Created</th>
                <th>Due</th>
                <th style={{ minWidth: 240 }}>Status / Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state"><p>No invoices found</p></div></td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setPreview(inv)}>
                  <td style={{ fontWeight: 700, color: 'var(--accent-light)', fontFamily: 'var(--font-display)' }}>
                    {inv.invoice_number}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{inv.client_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inv.client_email}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inv.project_title || '—'}</div>
                    {inv.stage && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inv.stage}</div>}
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontSize: 14 }}>
                    ${fmt(inv.amount)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(inv.created_at)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(inv.due_date)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`badge ${STATUS_COLORS[inv.status] || 'badge-gray'}`}>{inv.status || 'draft'}</span>
                        {inv.sent_at && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sent {fmtDate(inv.sent_at)}</span>}
                        {inv.paid_at && <span style={{ fontSize: 10, color: 'var(--success)' }}>Paid {fmtDate(inv.paid_at)}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Preview" onClick={() => setPreview(inv)}><Eye size={13} /></button>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(inv)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        {inv.status !== 'paid' && (
                          <>
                            {(inv.status === 'draft' || !inv.status) && (
                              <button className="btn btn-primary btn-sm" disabled={sendingId === inv.id} onClick={() => handleSend(inv)}>
                                <Send size={12} /> {sendingId === inv.id ? '...' : 'Send'}
                              </button>
                            )}
                            {(inv.status === 'sent' || inv.status === 'overdue') && (
                              <button className="btn btn-secondary btn-sm" disabled={sendingId === `r-${inv.id}`} onClick={() => handleSend(inv, true)}>
                                <Bell size={12} /> {sendingId === `r-${inv.id}` ? '...' : 'Remind'}
                              </button>
                            )}
                            <button className="btn btn-success btn-sm" onClick={() => handleMarkPaid(inv)}>
                              <CheckSquare size={12} /> Paid
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit Invoice' : 'New Invoice'}</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Invoice Number</label>
                    <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label>Due Date</label>
                    <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Project</label>
                    <select value={form.project_id} onChange={e => handleProjectChange(e.target.value)}>
                      <option value="">Select project...</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Client *</label>
                    <select value={form.client_id} onChange={e => handleClientChange(e.target.value)} required>
                      <option value="">Select client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Client Address</label>
                    <input value={form.client_address} onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))} placeholder="Street, city, state" />
                  </div>
                  <div className="form-group">
                    <label>Stage / Milestone</label>
                    {(() => {
                      const p = projects.find(pr => pr.id === form.project_id);
                      const stages = p ? parseStages(p.payment_stages) : null;
                      const fee = parseFloat(p?.total_fee) || 0;
                      if (stages?.length) {
                        return (
                          <select value={form.stage} onChange={e => handleStageSelect(e.target.value)}>
                            <option value="">Select stage...</option>
                            {stages.map(s => (
                              <option key={s.name} value={s.name}>
                                {s.name} — {s.pct}%{fee > 0 ? ` ($${((fee * Number(s.pct)) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })})` : ''}
                              </option>
                            ))}
                          </select>
                        );
                      }
                      return <input value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} placeholder="e.g. Discovery, Design..." />;
                    })()}
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ margin: 0 }}>Line Items</label>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}><Plus size={12} /> Add Item</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 32px', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Description</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Amount (AUD)</span>
                    <span />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form.line_items.map((item, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 32px', gap: 8, alignItems: 'center' }}>
                        <input value={item.description} style={{ marginBottom: 0 }}
                          onChange={e => updateLineItem(idx, 'description', e.target.value)}
                          placeholder="Service or milestone description" />
                        <input type="number" step="0.01" min="0" value={item.amount} style={{ marginBottom: 0 }}
                          onChange={e => updateLineItem(idx, 'amount', e.target.value)} placeholder="0.00" />
                        <button type="button" className="btn btn-ghost btn-sm btn-icon"
                          style={{ color: 'var(--danger)' }} onClick={() => removeLineItem(idx)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Totals + GST */}
                  <div style={{ marginTop: 14, padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0, textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={form.charge_gst} style={{ width: 'auto', margin: 0 }}
                        onChange={e => setForm(f => ({ ...f, charge_gst: e.target.checked }))} />
                      Add 10% GST
                    </label>
                    <div style={{ textAlign: 'right', fontSize: 13 }}>
                      {(() => {
                        const { subtotal, gst, total } = calcTotals(form.line_items, form.charge_gst);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Subtotal: <strong style={{ color: 'var(--text-secondary)' }}>${fmt(subtotal)}</strong></span>
                            {form.charge_gst && <span style={{ color: 'var(--text-muted)' }}>GST (10%): <strong style={{ color: 'var(--text-secondary)' }}>${fmt(gst)}</strong></span>}
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontSize: 15 }}>Total: ${fmt(total)}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment reference, instructions..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Update Invoice' : 'Create Invoice'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preview && <InvoicePreview invoice={preview} settings={settings} clients={clients} onClose={() => setPreview(null)} />}
    </div>
  );
}


// ── Invoice Preview — NEX-A design (matches ProposalView) ──
const LOGO = 'https://static.wixstatic.com/media/f71431_61430c2cad9d4aa3b3c60140cf727352~mv2.png';

const BRAND = {
  black:     '#06090A',
  white:     '#ffffff',
  green:     '#c9fcd2',
  greenDeep: '#98efb7',
  greenSoft: '#e8ffef',
  muted:     '#6b7280',
  border:    '#e5e7eb',
  bg:        '#f3f4f6',
  ink:       '#06090A',
};

function InvoicePreview({ invoice, settings, clients = [], onClose }) {
  const printRef = useRef();

  const clientName = (invoice.client_name && !invoice.client_name.match(/^C\d{10,}/))
    ? invoice.client_name
    : (clients.find(c => c.id === invoice.client_id)?.name || invoice.client_name || '—');

  const lineItems = parseLineItems(invoice.line_items, invoice.amount, invoice.stage_description);
  const chargeGst = invoice.charge_gst === 'true' || invoice.charge_gst === true;
  const subtotal  = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const gst       = chargeGst ? subtotal * 0.1 : 0;
  const total     = subtotal + gst;
  const issueDate = fmtDate(invoice.created_at || new Date().toISOString());
  const dueDate   = fmtDate(invoice.due_date);
  const companyName = settings.company_name || 'NEX-A TECHNOLOGY SOLUTIONS';

  function handlePrint() {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><title>${invoice.invoice_number}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Instrument Sans',system-ui,sans-serif;background:#f3f4f6;color:#06090A;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{margin:0;size:A4}
  @keyframes none{}
</style></head><body>${content}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 700);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 820, maxHeight: '94vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', border: '1px solid var(--border-strong)' }}>

        {/* Toolbar */}
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: 15 }}>{invoice.invoice_number}</h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{clientName} · ${fmt(total)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Print / Download
            </button>
            <button onClick={onClose} className="btn btn-ghost btn-sm"><X size={16} /></button>
          </div>
        </div>

        {/* Scrollable invoice */}
        <div style={{ overflowY: 'auto', flex: 1, background: BRAND.bg }}>
          <div ref={printRef}>
            <div style={{
              fontFamily: "'Instrument Sans', system-ui, -apple-system, sans-serif",
              color: BRAND.ink,
              background: BRAND.bg,
            }}>
              <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap');`}</style>

              {/* ── Top nav bar (matches proposal) ── */}
              <div style={{ background: BRAND.black, padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={LOGO} alt="NEX-A"
                    style={{ height: 32, width: 'auto', objectFit: 'contain' }}
                    onError={e => { e.target.style.display = 'none'; }} />
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {companyName}
                  </span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Tax Invoice</span>
              </div>

              <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 20px 56px' }}>

                {/* ── Black hero card (matches proposal hero) ── */}
                <div style={{
                  background: BRAND.black, borderRadius: 16,
                  padding: '36px 44px', marginBottom: 3,
                  overflow: 'hidden', position: 'relative',
                }}>
                  {/* Green glow orb */}
                  <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, background: BRAND.green, borderRadius: '50%', opacity: 0.08, pointerEvents: 'none' }} />

                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: BRAND.green, marginBottom: 14 }}>
                    Tax Invoice
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <h2 style={{ fontSize: 26, fontWeight: 700, color: BRAND.white, lineHeight: 1.15, letterSpacing: '-0.5px', marginBottom: 8 }}>
                        {invoice.invoice_number}
                      </h2>
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                        Billed to <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{clientName}</strong>
                        {invoice.project_title && <span> · {invoice.project_title}</span>}
                      </p>
                    </div>
                    {/* Stage pill */}
                    {invoice.stage && (
                      <span style={{ padding: '6px 16px', background: 'rgba(201,252,210,0.12)', border: `1px solid rgba(201,252,210,0.3)`, borderRadius: 99, fontSize: 12, color: BRAND.green, fontWeight: 500, alignSelf: 'flex-start' }}>
                        {invoice.stage}
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 28 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Total Due</div>
                      <div style={{ fontSize: 30, fontWeight: 700, color: BRAND.green, letterSpacing: '-0.5px' }}>${fmt(total)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Issue Date</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{issueDate}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Due Date</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: invoice.status === 'overdue' ? '#f87171' : 'rgba(255,255,255,0.75)' }}>{dueDate}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Status</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: invoice.status === 'paid' ? BRAND.green : 'rgba(255,255,255,0.75)', textTransform: 'capitalize' }}>{invoice.status || 'Draft'}</div>
                    </div>
                  </div>
                </div>

                {/* ── White content card (matches proposal sections) ── */}
                <div style={{ background: BRAND.white, borderRadius: '0 0 16px 16px', marginBottom: 3 }}>

                  {/* From / Bill To */}
                  <div style={{ padding: '28px 44px', borderBottom: `1px solid ${BRAND.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 10 }}>From</div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{companyName}</div>
                      <div style={{ fontSize: 13, color: BRAND.muted, lineHeight: 1.8 }}>
                        {settings.company_address && <div>{settings.company_address}</div>}
                        {settings.company_email && <div>{settings.company_email}</div>}
                        {settings.company_phone && <div>{settings.company_phone}</div>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 10 }}>Bill To</div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{clientName}</div>
                      <div style={{ fontSize: 13, color: BRAND.muted, lineHeight: 1.8 }}>
                        {invoice.client_address && <div>{invoice.client_address}</div>}
                        {invoice.client_email && <div>{invoice.client_email}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Line items */}
                  <div style={{ padding: '28px 44px', borderBottom: `1px solid ${BRAND.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 16 }}>Line Items</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${BRAND.ink}` }}>
                          <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted }}>Description</th>
                          <th style={{ padding: '8px 0', textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, width: 140 }}>Amount (AUD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.length > 0 ? lineItems.map((item, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                            <td style={{ padding: '14px 0', color: '#222', lineHeight: 1.6, verticalAlign: 'top' }}>{item.description || '—'}</td>
                            <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 600, color: BRAND.ink }}>${fmt(item.amount)}</td>
                          </tr>
                        )) : (
                          <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                            <td style={{ padding: '14px 0', color: BRAND.muted }}>Professional Services</td>
                            <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 600 }}>${fmt(invoice.amount)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Totals */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <div style={{ width: 280 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${BRAND.border}`, fontSize: 13 }}>
                          <span style={{ color: BRAND.muted }}>Subtotal (ex GST)</span>
                          <span style={{ fontWeight: 500 }}>${fmt(subtotal)}</span>
                        </div>
                        {chargeGst && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${BRAND.border}`, fontSize: 13 }}>
                            <span style={{ color: BRAND.muted }}>GST (10%)</span>
                            <span style={{ fontWeight: 500 }}>${fmt(gst)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: BRAND.black, borderRadius: 8, marginTop: 8 }}>
                          <span style={{ color: BRAND.white, fontWeight: 700, fontSize: 13 }}>Total Due</span>
                          <span style={{ color: BRAND.green, fontWeight: 700, fontSize: 16 }}>${fmt(total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment details (matches proposal payment schedule style) */}
                  {(settings.bank_bsb || settings.bank_account || settings.paypal_link || settings.stripe_link) && (
                    <div style={{ padding: '28px 44px', borderBottom: `1px solid ${BRAND.border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 14 }}>Payment Details</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(settings.bank_bsb || settings.bank_account) && (
                          <div style={{ padding: '14px 18px', background: BRAND.greenSoft, border: `1px solid ${BRAND.greenDeep}`, borderRadius: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, marginBottom: 4 }}>Bank Transfer</div>
                            <div style={{ fontSize: 13, color: BRAND.muted, lineHeight: 1.8 }}>
                              {settings.bank_name && <div>{settings.bank_name}</div>}
                              {settings.bank_bsb && <div>BSB: <strong style={{ color: BRAND.ink }}>{settings.bank_bsb}</strong> · Account: <strong style={{ color: BRAND.ink }}>{settings.bank_account}</strong></div>}
                            </div>
                          </div>
                        )}
                        {settings.paypal_link && (
                          <div style={{ padding: '14px 18px', background: BRAND.bg, border: `1px solid ${BRAND.border}`, borderRadius: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, marginBottom: 2 }}>PayPal / PayID</div>
                            <div style={{ fontSize: 13, color: BRAND.muted }}>{settings.paypal_link}</div>
                          </div>
                        )}
                        {settings.stripe_link && (
                          <div style={{ padding: '14px 18px', background: BRAND.bg, border: `1px solid ${BRAND.border}`, borderRadius: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, marginBottom: 2 }}>Stripe</div>
                            <div style={{ fontSize: 13, color: BRAND.muted }}>{settings.stripe_link}</div>
                          </div>
                        )}
                      </div>
                      {settings.payment_terms && (
                        <div style={{ marginTop: 14, fontSize: 12, color: BRAND.muted, lineHeight: 1.7 }}>
                          {settings.payment_terms}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {invoice.notes && (
                    <div style={{ padding: '20px 44px', borderBottom: `1px solid ${BRAND.border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 8 }}>Notes</div>
                      <div style={{ fontSize: 13, color: BRAND.muted, lineHeight: 1.7 }}>{invoice.notes}</div>
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ padding: '20px 44px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: '#d1d5db' }}>
                      {settings.invoice_footer || 'Please include the Invoice # as your payment reference.'}
                    </div>
                    <img src={LOGO} alt={companyName} style={{ height: 18, opacity: 0.2 }}
                      onError={e => { e.target.style.display = 'none'; }} />
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
