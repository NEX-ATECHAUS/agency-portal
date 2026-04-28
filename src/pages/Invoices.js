import React, { useState, useEffect, useRef } from 'react';
import { InvoicesAPI, ClientsAPI, ProjectsAPI, SettingsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Send, CheckSquare, X, Eye, Bell, Trash2 } from 'lucide-react';
import { format, addDays } from 'date-fns';

function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}


const STATUS_COLORS = {
  draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green', overdue: 'badge-red',
};

function fmt(n) {
  return Number(parseFloat(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextInvoiceNumber(invoices) {
  const nums = invoices.map(i => parseInt((i.invoice_number || '').replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
  return `INV-${String(nums.length ? Math.max(...nums) + 1 : 1001).padStart(4, '0')}`;
}

export default function Invoices() {
  const toast = useToast();
  const [invoices, setInvoices]     = useState([]);
  const [clients, setClients]       = useState([]);
  const [projects, setProjects]     = useState([]);
  const [settings, setSettings]     = useState({});
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [showModal, setShowModal]   = useState(false);
  const [preview, setPreview]       = useState(null);
  const [editing, setEditing]       = useState(null);
  const [sendingId, setSendingId]   = useState(null);

  // Line items: [{ description, amount }]
  const emptyForm = (allInv = invoices) => ({
    invoice_number: nextInvoiceNumber(allInv),
    project_id: '', project_title: '',
    client_id: '', client_name: '', client_email: '', client_address: '',
    stage: '',
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    charge_gst: true,
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
      const sorted = inv.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setInvoices(sorted); setClients(c); setProjects(p); setSettings(s);
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
    const gst      = chargeGst ? subtotal * 0.1 : 0;
    return { subtotal, gst, total: subtotal + gst };
  }

  function parseStages(raw) {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // ── Project select → auto-fill ─────────────────────────
  function handleProjectChange(pid) {
    const p = projects.find(pr => pr.id === pid);
    if (!p) { setForm(f => ({ ...f, project_id: pid, project_title: '', stage: '', line_items: f.line_items })); return; }
    const client = clients.find(c => c.id === p.client_id);
    const stages = parseStages(p.payment_stages);
    const currentStage = p.current_stage || (stages?.[0]?.name) || '';
    // Auto-fill amount from stage percentage if total fee exists
    const fee = parseFloat(p.total_fee) || 0;
    const stageObj = stages?.find(s => s.name === currentStage);
    const stageAmount = fee > 0 && stageObj ? (fee * Number(stageObj.pct)) / 100 : null;

    setForm(f => ({
      ...f,
      project_id: pid, project_title: p.title,
      client_id: p.client_id || f.client_id,
      client_name: client?.name || f.client_name,
      client_email: client?.email || f.client_email,
      client_address: client?.address || f.client_address,
      stage: currentStage,
      // Auto-fill line item if we have a fee amount
      line_items: stageAmount
        ? [{ description: `${currentStage} phase — ${p.title}`, amount: stageAmount.toFixed(2) }]
        : f.line_items,
    }));
  }

  function handleStageSelect(stageName) {
    const p = projects.find(pr => pr.id === form.project_id);
    const stages = p ? parseStages(p.payment_stages) : null;
    const fee = parseFloat(p?.total_fee) || 0;
    const stageObj = stages?.find(s => s.name === stageName);
    const stageAmount = fee > 0 && stageObj ? (fee * Number(stageObj.pct)) / 100 : null;
    setForm(f => ({
      ...f,
      stage: stageName,
      line_items: stageAmount
        ? [{ description: `${stageName} phase — ${p.title}`, amount: stageAmount.toFixed(2) }]
        : f.line_items,
    }));
  }

  function handleClientChange(cid) {
    const c = clients.find(cl => cl.id === cid);
    setForm(f => ({
      ...f,
      client_id: cid,
      client_name: c?.name || '',
      client_email: c?.email || '',
      client_address: c?.address || '',
    }));
  }

  function openCreate() {
    setForm(emptyForm(invoices));
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(inv) {
    let line_items = [{ description: '', amount: '' }];
    try { line_items = JSON.parse(inv.line_items) || line_items; } catch {}
    setForm({
      invoice_number: inv.invoice_number || '',
      project_id: inv.project_id || '', project_title: inv.project_title || '',
      client_id: inv.client_id || '', client_name: inv.client_name || '',
      client_email: inv.client_email || '', client_address: inv.client_address || '',
      stage: inv.stage || '',
      due_date: inv.due_date || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      charge_gst: inv.charge_gst === 'false' ? false : true,
      notes: inv.notes || '',
      line_items,
    });
    setEditing(inv);
    setShowModal(true);
  }

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

  async function handleSend(invoice, isReminder = false) {
    // Resolve email — try invoice field first, then look up from clients list
    const resolvedEmail = invoice.client_email ||
      clients.find(c => c.id === invoice.client_id)?.email || '';

    if (!resolvedEmail || !resolvedEmail.includes('@')) {
      toast.error('No valid email address for this client. Edit the invoice to add one.');
      return;
    }

    setSendingId(isReminder ? `r-${invoice.id}` : invoice.id);
    try {
      const project = projects.find(p => p.id === invoice.project_id);
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice',
          to: resolvedEmail,
          invoice: { ...invoice, client_email: resolvedEmail, is_reminder: isReminder },
          project,
          companyName: settings.company_name,
          settings,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Email failed');
      }
      if (!isReminder) {
        const updated = await InvoicesAPI.update(invoice.id, {
          ...invoice,
          client_email: resolvedEmail,
          status: 'sent',
          sent_at: new Date().toISOString(),
        });
        setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      }
      toast.success(isReminder ? 'Reminder sent!' : 'Invoice sent!');
    } catch (err) {
      toast.error(err.message || 'Failed to send');
    } finally {
      setSendingId(null);
    }
  }

  async function handleMarkPaid(invoice) {
    try {
      const now = new Date().toISOString();
      const updated = await InvoicesAPI.update(invoice.id, {
        ...invoice,
        status: 'paid',
        paid_at: now,
      });
      setInvoices(prev => prev.map(i => i.id === updated.id ? { ...updated, status: 'paid', paid_at: now } : i));
      toast.success('Marked as paid ✓');
    } catch (err) {
      toast.error('Failed to update: ' + err.message);
    }
  }

  const filtered = invoices.filter(i => {
    const q = search.toLowerCase();
    return (!search || [i.invoice_number, i.client_name, i.project_title].some(v => (v||'').toLowerCase().includes(q)))
      && (filter === 'all' || i.status === filter);
  });

  const totalByStatus = s => invoices.filter(i => i.status === s).reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

  if (loading) return <div className="loading-center" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{invoices.length} total · {invoices.filter(i => i.status === 'paid').length} paid</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> New Invoice</button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {[
          { label: 'Draft', status: 'draft', color: 'var(--text-muted)' },
          { label: 'Sent', status: 'sent', color: 'var(--info)' },
          { label: 'Paid', status: 'paid', color: 'var(--success)' },
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

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all','draft','sent','paid','overdue'].map(s => (
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
                <th>Invoice #</th>
                <th>Client</th>
                <th>Project / Stage</th>
                <th>Total</th>
                <th>Created</th>
                <th>Due</th>
                <th style={{ minWidth: 220 }}>Status / Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><p>No invoices found</p></div></td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setPreview(inv)}>
                  <td style={{ fontWeight: 700, color: 'var(--accent-light)', fontFamily: 'var(--font-display)' }}>{inv.invoice_number}</td>
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
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inv.created_at ? fmtDate(inv.created_at) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(inv.due_date)}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span className={`badge ${STATUS_COLORS[inv.status] || 'badge-gray'}`}>{inv.status || 'draft'}</span>
                      {inv.sent_at && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sent {fmtDate(inv.sent_at)}</span>}
                      {inv.paid_at && <span style={{ fontSize: 10, color: 'var(--success)' }}>Paid {fmtDate(inv.paid_at)}</span>}
                    </div>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
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
                    <input value={form.client_address} onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))} placeholder="Street address, city, state" />
                  </div>
                  <div className="form-group">
                    <label>Stage / Milestone</label>
                    {(() => {
                      const p = projects.find(pr => pr.id === form.project_id);
                      const stages = p ? parseStages(p.payment_stages) : null;
                      const fee = parseFloat(p?.total_fee) || 0;
                      if (stages && stages.length > 0) {
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
                      return (
                        <input value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                          placeholder="e.g. Discovery, Design..." />
                      );
                    })()}
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Line Items</div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}><Plus size={12} /> Add Item</button>
                  </div>
                  {/* Column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 32px', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Description</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Amount ex GST</span>
                    <span />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {form.line_items.map((item, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 32px', gap: 8, alignItems: 'center' }}>
                        <input value={item.description} style={{ marginBottom: 0 }}
                          onChange={e => updateLineItem(idx, 'description', e.target.value)}
                          placeholder="Service or milestone description" />
                        <input type="number" step="0.01" min="0" value={item.amount} style={{ marginBottom: 0 }}
                          onChange={e => updateLineItem(idx, 'amount', e.target.value)}
                          placeholder="0.00" />
                        <button type="button" className="btn btn-ghost btn-sm btn-icon"
                          style={{ color: 'var(--danger)' }} onClick={() => removeLineItem(idx)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* GST toggle + totals */}
                  <div style={{ marginTop: 14, padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={form.charge_gst} style={{ width: 'auto', margin: 0 }}
                        onChange={e => setForm(f => ({ ...f, charge_gst: e.target.checked }))} />
                      Charge 10% GST
                    </label>
                    <div style={{ textAlign: 'right', fontSize: 13 }}>
                      {(() => {
                        const { subtotal, gst, total } = calcTotals(form.line_items, form.charge_gst);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ color: 'var(--text-muted)' }}>Subtotal: <span style={{ color: 'var(--text-secondary)' }}>${fmt(subtotal)}</span></div>
                            {form.charge_gst && <div style={{ color: 'var(--text-muted)' }}>GST 10%: <span style={{ color: 'var(--text-secondary)' }}>${fmt(gst)}</span></div>}
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                              Total: ${fmt(total)}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment reference, additional instructions..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create Invoice'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preview && <InvoicePreview invoice={preview} settings={settings} clients={clients} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Invoice Preview — NEX-A design
// ─────────────────────────────────────────────────────────────
function InvoicePreview({ invoice, settings, clients = [], onClose }) {
  const printRef = useRef();

  // ── Resolve client name (handle old invoices that stored ID instead of name) ──
  const clientName = (invoice.client_name && !invoice.client_name.match(/^C\d{13}/))
    ? invoice.client_name
    : (clients.find(c => c.id === invoice.client_id)?.name || invoice.client_name || '—');

  // ── Resolve line items robustly ──
  let lineItems = [];
  try { lineItems = JSON.parse(invoice.line_items || '[]'); } catch {}
  // Fallback: old invoices without line_items stored
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    const fallbackAmount = parseFloat(invoice.amount) || 0;
    const fallbackDesc   = invoice.stage_description || invoice.stage || 'Professional Services';
    if (fallbackAmount > 0 || fallbackDesc) {
      lineItems = [{ description: fallbackDesc, amount: fallbackAmount }];
    }
  }

  const chargeGst = invoice.charge_gst !== 'false' && invoice.charge_gst !== false;
  const subtotal  = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const gst       = chargeGst ? subtotal * 0.1 : 0;
  const total     = subtotal + gst;

  const issueDate    = fmtDate(invoice.created_at || new Date().toISOString());
  const companyName  = settings.company_name  || 'NEX-A';
  const accent       = settings.accent_color  || '#6c63ff';

  function handlePrint() {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${invoice.invoice_number}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Instrument Sans',system-ui,sans-serif;background:#fff;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{margin:0;size:A4}
</style>
</head><body>${content}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 700);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>

        {/* Modal toolbar */}
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

        {/* Scrollable invoice body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div ref={printRef}>
            <div style={{ background: '#fff', fontFamily: "'Instrument Sans', system-ui, sans-serif", color: '#111' }}>

              {/* ── Header bar ── */}
              <div style={{ background: '#06090A', padding: '28px 44px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {settings.logo_url
                    ? <img src={settings.logo_url} alt={companyName} style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
                    : <div style={{ height: 36, width: 36, background: accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff' }}>{companyName[0]}</div>
                  }
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{companyName}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 6 }}>INVOICE</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.9 }}>
                    <span style={{ color: 'rgba(255,255,255,0.75)' }}>#{invoice.invoice_number}</span><br />
                    <span>Issued {issueDate}</span><br />
                    <span style={{ color: invoice.status === 'overdue' ? '#f87171' : 'rgba(255,255,255,0.75)' }}>Due {fmtDate(invoice.due_date)}</span>
                  </div>
                </div>
              </div>

              <div style={{ padding: '36px 44px' }}>

                {/* ── From / Bill To ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginBottom: 36, paddingBottom: 28, borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#aaa', marginBottom: 10 }}>From</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{companyName}</div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.8 }}>
                      {settings.company_address && <div>{settings.company_address}</div>}
                      {settings.company_email && <div>{settings.company_email}</div>}
                      {settings.company_phone && <div>{settings.company_phone}</div>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#aaa', marginBottom: 10 }}>Bill To</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{clientName}</div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.8 }}>
                      {invoice.client_address && <div>{invoice.client_address}</div>}
                      {invoice.client_email && <div>{invoice.client_email}</div>}
                    </div>
                  </div>
                </div>

                {/* ── Project / Stage tag ── */}
                {(invoice.project_title || invoice.stage) && (
                  <div style={{ marginBottom: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {invoice.project_title && (
                      <span style={{ padding: '4px 12px', background: '#f5f5f5', borderRadius: 99, fontSize: 12, color: '#555', fontWeight: 500 }}>
                        {invoice.project_title}
                      </span>
                    )}
                    {invoice.stage && (
                      <span style={{ padding: '4px 12px', background: '#f0f0ff', borderRadius: 99, fontSize: 12, color: accent, fontWeight: 500 }}>
                        {invoice.stage}
                      </span>
                    )}
                  </div>
                )}

                {/* ── Line items ── */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${accent}` }}>
                      <th style={{ padding: '10px 0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#aaa' }}>Description</th>
                      <th style={{ padding: '10px 0', textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#aaa', width: 140 }}>Amount (AUD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '14px 0', verticalAlign: 'top', color: '#222', lineHeight: 1.5 }}>{item.description || '—'}</td>
                        <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 600, color: '#111' }}>${fmt(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ── Totals ── */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
                  <div style={{ width: 260, borderTop: '1px solid #eee', paddingTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#888', marginBottom: 8 }}>
                      <span>Subtotal (ex GST)</span>
                      <span style={{ color: '#333', fontWeight: 500 }}>${fmt(subtotal)}</span>
                    </div>
                    {chargeGst && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#888', marginBottom: 10 }}>
                        <span>GST (10%)</span>
                        <span style={{ color: '#333', fontWeight: 500 }}>${fmt(gst)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#06090A', borderRadius: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Total Due</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: accent }}>${fmt(total)}</span>
                    </div>
                  </div>
                </div>

                {/* ── Payment details ── */}
                {(settings.bank_bsb || settings.bank_account || settings.paypal_link || settings.stripe_link) && (
                  <div style={{ background: '#f9fafb', border: '1px solid #e8e8e8', borderRadius: 10, padding: '18px 22px', marginBottom: 24 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#aaa', marginBottom: 12 }}>Payment Details</div>
                    <div style={{ fontSize: 13, lineHeight: 2, color: '#444' }}>
                      {(settings.bank_bsb || settings.bank_account) && (
                        <div>
                          <strong>Bank Transfer</strong>
                          {settings.bank_name && <span> · {settings.bank_name}</span>}
                          {settings.bank_bsb && <span> · BSB: <strong>{settings.bank_bsb}</strong></span>}
                          {settings.bank_account && <span> · Account: <strong>{settings.bank_account}</strong></span>}
                        </div>
                      )}
                      {settings.paypal_link && <div><strong>PayPal / PayID:</strong> {settings.paypal_link}</div>}
                      {settings.stripe_link && <div><strong>Stripe:</strong> {settings.stripe_link}</div>}
                    </div>
                    {settings.payment_terms && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e8e8e8', fontSize: 12, color: '#888', lineHeight: 1.6 }}>
                        {settings.payment_terms}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Notes ── */}
                {invoice.notes && (
                  <div style={{ fontSize: 12, color: '#888', lineHeight: 1.7, marginBottom: 24 }}>
                    {invoice.notes}
                  </div>
                )}

                {/* ── Footer ── */}
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
                  {settings.invoice_footer || 'Please include the Invoice # as your payment reference.'}
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
