import React, { useState, useEffect, useRef } from 'react';
import { InvoicesAPI, ClientsAPI, ProjectsAPI, SettingsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Send, CheckSquare, X, Eye, Bell, Trash2 } from 'lucide-react';
import { format, addDays } from 'date-fns';

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
    setSendingId(isReminder ? `r-${invoice.id}` : invoice.id);
    try {
      const project = projects.find(p => p.id === invoice.project_id);
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice', to: invoice.client_email,
          invoice: { ...invoice, is_reminder: isReminder },
          project, companyName: settings.company_name, settings,
        }),
      });
      if (!res.ok) throw new Error('Email failed');
      if (!isReminder) {
        const updated = await InvoicesAPI.update(invoice.id, { status: 'sent', sent_at: new Date().toISOString() });
        setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      }
      toast.success(isReminder ? 'Reminder sent!' : 'Invoice sent!');
    } catch (err) { toast.error(err.message || 'Failed to send'); }
    finally { setSendingId(null); }
  }

  async function handleMarkPaid(invoice) {
    try {
      const updated = await InvoicesAPI.update(invoice.id, { status: 'paid', paid_at: new Date().toISOString() });
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      toast.success('Marked as paid');
    } catch { toast.error('Failed to update'); }
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
                <th>Status</th>
                <th style={{ minWidth: 200 }}>Actions</th>
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
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inv.created_at ? inv.created_at.split('T')[0] : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{inv.due_date || '—'}</td>
                  <td><span className={`badge ${STATUS_COLORS[inv.status] || 'badge-gray'}`}>{inv.status || 'draft'}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Preview" onClick={() => setPreview(inv)}><Eye size={13} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(inv)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      {inv.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" disabled={sendingId === inv.id} onClick={() => handleSend(inv)}>
                          <Send size={12} /> {sendingId === inv.id ? '...' : 'Send'}
                        </button>
                      )}
                      {(inv.status === 'sent' || inv.status === 'overdue') && (
                        <>
                          <button className="btn btn-secondary btn-sm" disabled={sendingId === `r-${inv.id}`} onClick={() => handleSend(inv, true)}>
                            <Bell size={12} /> {sendingId === `r-${inv.id}` ? '...' : 'Remind'}
                          </button>
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
  const accent      = settings.accent_color || '#6c63ff';
  const companyName = settings.company_name || 'NEX-A PORTAL';
  const issueDate   = invoice.created_at ? invoice.created_at.split('T')[0] : format(new Date(), 'yyyy-MM-dd');

  let lineItems = [];
  try { lineItems = JSON.parse(invoice.line_items || '[]'); } catch {}
  if (!lineItems.length && invoice.stage_description) {
    lineItems = [{ description: invoice.stage_description, amount: invoice.amount }];
  }

  const chargeGst = invoice.charge_gst !== 'false' && invoice.charge_gst !== false;
  const subtotal  = lineItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const gst       = chargeGst ? subtotal * 0.1 : 0;
  const total     = subtotal + gst;

  function handlePrint() {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${invoice.invoice_number}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Instrument Sans',system-ui,sans-serif;background:#fff;color:#06090A;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{margin:0;size:A4}
</style>
</head><body>${content}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 700);
  }

  // Shared cell styles
  const th = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    color: '#6b7280', borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
  };
  const td = (right = false) => ({
    padding: '12px 12px', fontSize: 13,
    borderBottom: '1px solid #e5e7eb',
    textAlign: right ? 'right' : 'left', verticalAlign: 'top',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
        <div className="modal-header">
          <h3>{invoice.invoice_number}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download / Print
            </button>
            <button onClick={onClose} className="btn btn-ghost btn-sm"><X size={16} /></button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: '80vh' }}>
          <div ref={printRef}>
            <div style={{
              background: '#ffffff',
              fontFamily: "'Instrument Sans', system-ui, sans-serif",
              color: '#06090A',
            }}>

              {/* Black header bar */}
              <div style={{
                background: '#06090A',
                padding: '26px 40px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {settings.logo_url ? (
                    <img src={settings.logo_url} alt={companyName} style={{ height: 52, width: 'auto', objectFit: 'contain' }} />
                  ) : (
                    <div style={{
                      width: 48, height: 48, background: accent, borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, fontWeight: 700, color: '#fff',
                    }}>{companyName[0]}</div>
                  )}
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', color: '#ffffff' }}>INVOICE</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 2 }}>
                  <div><strong style={{ color: '#ffffff' }}>Invoice #:</strong> {invoice.invoice_number}</div>
                  <div><strong style={{ color: '#ffffff' }}>Date:</strong> {issueDate}</div>
                  <div><strong style={{ color: '#ffffff' }}>Due:</strong> {invoice.due_date}</div>
                </div>
              </div>

              <div style={{ padding: '32px 40px 40px' }}>
                {invoice.project_title && (
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
                    {invoice.project_title}{invoice.stage ? ` · ${invoice.stage}` : ''}
                  </div>
                )}

              {/* From / Bill to */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#6b7280', marginBottom: 8 }}>From</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    <strong>{companyName}</strong>
                    {settings.company_address && <><br />{settings.company_address}</>}
                    {settings.company_email && <><br />{settings.company_email}</>}
                    {settings.company_phone && <><br />{settings.company_phone}</>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#6b7280', marginBottom: 8 }}>Bill To</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    <strong>{invoice.client_name && !invoice.client_name.startsWith('C177') ? invoice.client_name : (clients?.find(c => c.id === invoice.client_id)?.name || invoice.client_name)}</strong>
                    {invoice.client_address && <><br />{invoice.client_address}</>}
                    {invoice.client_email && <><br />{invoice.client_email}</>}
                  </div>
                </div>
              </div>

              {/* Line items table */}
              <div style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#6b7280', marginBottom: 8 }}>Line Items</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>Description</th>
                      <th style={{ ...th, textAlign: 'right', width: 160 }}>Amount ex GST (A$)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, i) => (
                      <tr key={i}>
                        <td style={td()}>{item.description || '—'}</td>
                        <td style={td(true)}>{fmt(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{ marginBottom: 28 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280' }}><strong>Subtotal (ex GST)</strong></td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', width: 160 }}>${fmt(subtotal)}</td>
                    </tr>
                    {chargeGst && (
                      <tr>
                        <td style={{ padding: '4px 12px', textAlign: 'right', color: '#6b7280' }}>GST 10%</td>
                        <td style={{ padding: '4px 12px', textAlign: 'right' }}>${fmt(gst)}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}><strong>Total</strong></td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: accent }}>${fmt(total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Payment details */}
              {(settings.bank_bsb || settings.paypal_link || settings.stripe_link) && (
                <div style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  borderRadius: 8, padding: '14px 16px', marginBottom: 24,
                }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8, fontWeight: 600 }}>Payment Details</div>
                  <div style={{ fontSize: 12, lineHeight: 1.8, color: '#374151' }}>
                    {settings.bank_name && <div><strong>Bank:</strong> {settings.bank_name}</div>}
                    {settings.bank_bsb && <div><strong>BSB:</strong> {settings.bank_bsb} &nbsp;·&nbsp; <strong>Account:</strong> {settings.bank_account}</div>}
                    {settings.paypal_link && <div><strong>PayPal / PayID:</strong> {settings.paypal_link}</div>}
                    {settings.stripe_link && <div><strong>Stripe:</strong> {settings.stripe_link}</div>}
                  </div>
                  {settings.payment_terms && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8, paddingTop: 8, borderTop: '1px solid #d1fae5' }}>
                      {settings.payment_terms}
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {invoice.notes && (
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
                  {invoice.notes}
                </div>
              )}

              {/* Footer */}
              <div style={{ fontSize: 12, color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: 16, textAlign: 'center' }}>
                {settings.invoice_footer || `Please include the Invoice # as your payment reference.`}
              </div>
              </div>{/* end padding wrapper */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
