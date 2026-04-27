import React, { useState, useEffect, useRef } from 'react';
import { InvoicesAPI, ClientsAPI, ProjectsAPI, SettingsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Send, CheckSquare, X, Eye, Bell } from 'lucide-react';
import { format, addDays } from 'date-fns';

const STATUS_COLORS = {
  draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green', overdue: 'badge-red',
};

function fmt(amount) {
  return Number(parseFloat(amount) || 0).toLocaleString('en-AU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function nextInvoiceNumber(invoices) {
  const nums = invoices
    .map(i => parseInt((i.invoice_number || '').replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1001;
  return `INV-${String(next).padStart(4, '0')}`;
}

function autoDescription(projectTitle, stage) {
  if (projectTitle && stage) return `${stage} phase — ${projectTitle}`;
  return projectTitle || stage || '';
}

export default function Invoices() {
  const toast = useToast();
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [sendingId, setSendingId] = useState(null);

  const emptyForm = (allInvoices = invoices) => ({
    invoice_number: nextInvoiceNumber(allInvoices),
    project_id: '', project_title: '',
    client_id: '', client_name: '', client_email: '',
    stage: '', stage_description: '', amount: '',
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
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
      setInvoices(sorted);
      setClients(c); setProjects(p); setSettings(s);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }

  function openCreate() {
    setForm(emptyForm(invoices));
    setEditingInvoice(null);
    setShowModal(true);
  }

  function openEdit(inv) {
    setForm({
      invoice_number: inv.invoice_number || '',
      project_id: inv.project_id || '',
      project_title: inv.project_title || '',
      client_id: inv.client_id || '',
      client_name: inv.client_name || '',
      client_email: inv.client_email || '',
      stage: inv.stage || '',
      stage_description: inv.stage_description || '',
      amount: inv.amount || '',
      due_date: inv.due_date || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    });
    setEditingInvoice(inv);
    setShowModal(true);
  }

  function handleProjectChange(projectId) {
    const p = projects.find(pr => pr.id === projectId);
    if (!p) { setForm(f => ({ ...f, project_id: projectId, project_title: '' })); return; }
    const client = clients.find(c => c.id === p.client_id);
    const stage = p.current_stage || '';
    setForm(f => ({
      ...f,
      project_id: projectId,
      project_title: p.title,
      client_id: p.client_id || f.client_id,
      client_name: client?.name || f.client_name,
      client_email: client?.email || f.client_email,
      stage: f.stage || stage,
      stage_description: f.stage_description || autoDescription(p.title, stage),
    }));
  }

  function handleStageChange(stage) {
    const p = projects.find(pr => pr.id === form.project_id);
    setForm(f => ({
      ...f, stage,
      stage_description: f.stage_description || autoDescription(p?.title || form.project_title, stage),
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      if (editingInvoice) {
        const updated = await InvoicesAPI.update(editingInvoice.id, form);
        setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
        toast.success('Invoice updated');
      } else {
        const invoice = await InvoicesAPI.create(form);
        setInvoices(prev => [invoice, ...prev]);
        toast.success('Invoice created');
      }
      setShowModal(false);
    } catch { toast.error('Failed to save invoice'); }
  }

  async function sendEmail(invoice, isReminder = false) {
    const project = projects.find(p => p.id === invoice.project_id);
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invoice',
        to: invoice.client_email,
        invoice: { ...invoice, is_reminder: isReminder },
        project,
        companyName: settings.company_name,
        settings,
      }),
    });
    if (!res.ok) throw new Error('Email failed');
  }

  async function handleSend(invoice) {
    setSendingId(invoice.id);
    try {
      await sendEmail(invoice, false);
      const updated = await InvoicesAPI.update(invoice.id, {
        status: 'sent', sent_at: new Date().toISOString(),
      });
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      toast.success('Invoice sent!');
    } catch (err) { toast.error(err.message || 'Failed to send'); }
    finally { setSendingId(null); }
  }

  async function handleReminder(invoice) {
    setSendingId(`reminder-${invoice.id}`);
    try {
      await sendEmail(invoice, true);
      toast.success('Reminder sent!');
    } catch (err) { toast.error(err.message || 'Failed to send reminder'); }
    finally { setSendingId(null); }
  }

  async function handleMarkPaid(invoice) {
    try {
      const updated = await InvoicesAPI.update(invoice.id, {
        status: 'paid', paid_at: new Date().toISOString(),
      });
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      toast.success('Marked as paid');
    } catch { toast.error('Failed to update'); }
  }

  const filtered = invoices.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      (i.invoice_number || '').toLowerCase().includes(q) ||
      (i.client_name || '').toLowerCase().includes(q) ||
      (i.project_title || '').toLowerCase().includes(q);
    return matchSearch && (filter === 'all' || i.status === filter);
  });

  const totalByStatus = s => invoices
    .filter(i => i.status === s)
    .reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

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
          <input placeholder="Search by client, project or invoice number..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'draft', 'sent', 'paid', 'overdue'].map(s => (
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
                <th>Amount</th>
                <th>Created</th>
                <th>Due Date</th>
                <th>Status</th>
                <th style={{ minWidth: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><p>No invoices found</p></div></td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setPreviewInvoice(inv)}>
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
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {inv.created_at ? inv.created_at.split('T')[0] : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{inv.due_date || '—'}</td>
                  <td><span className={`badge ${STATUS_COLORS[inv.status] || 'badge-gray'}`}>{inv.status || 'draft'}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Preview" onClick={() => setPreviewInvoice(inv)}>
                        <Eye size={13} />
                      </button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(inv)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      {inv.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" disabled={sendingId === inv.id}
                          onClick={() => handleSend(inv)}>
                          <Send size={12} /> {sendingId === inv.id ? 'Sending...' : 'Send'}
                        </button>
                      )}
                      {(inv.status === 'sent' || inv.status === 'overdue') && (
                        <>
                          <button className="btn btn-secondary btn-sm" disabled={sendingId === `reminder-${inv.id}`}
                            title="Send payment reminder" onClick={() => handleReminder(inv)}>
                            <Bell size={12} /> {sendingId === `reminder-${inv.id}` ? 'Sending...' : 'Remind'}
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
              <h3>{editingInvoice ? 'Edit Invoice' : 'New Invoice'}</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Invoice Number</label>
                    <input value={form.invoice_number}
                      onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label>Due Date</label>
                    <input type="date" value={form.due_date}
                      onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
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
                    <select value={form.client_id} onChange={e => {
                      const c = clients.find(cl => cl.id === e.target.value);
                      setForm(f => ({ ...f, client_id: e.target.value, client_name: c?.name || '', client_email: c?.email || '' }));
                    }} required>
                      <option value="">Select client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Stage</label>
                    <input value={form.stage} onChange={e => handleStageChange(e.target.value)}
                      placeholder="e.g. Discovery, Design, Development" />
                  </div>
                  <div className="form-group">
                    <label>Amount (AUD) *</label>
                    <input type="number" step="0.01" min="0" required value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="5000.00" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={3} value={form.stage_description}
                    onChange={e => setForm(f => ({ ...f, stage_description: e.target.value }))}
                    placeholder="Auto-filled from project and stage — edit as needed" />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Auto-populated from project + stage. You can edit this freely.
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewInvoice && (
        <InvoicePreview invoice={previewInvoice} settings={settings} onClose={() => setPreviewInvoice(null)} />
      )}
    </div>
  );
}

function InvoicePreview({ invoice, settings, onClose }) {
  const printRef = useRef();
  const accent = settings.accent_color || '#6c63ff';
  const companyName = settings.company_name || 'Agency';
  const issueDate = invoice.created_at ? invoice.created_at.split('T')[0] : format(new Date(), 'yyyy-MM-dd');

  function handlePrint() {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${invoice.invoice_number}</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; background: #fff; color: #1a1a2e; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; size: A4; }
  </style>
</head>
<body>${content}</body>
</html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 700);
  }

  const lineAmount = parseFloat(invoice.amount || 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h3>Invoice Preview — {invoice.invoice_number}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download / Print
            </button>
            <button onClick={onClose} className="btn btn-ghost btn-sm"><X size={16} /></button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: '75vh' }}>
          <div ref={printRef}>
            <div style={{
              background: '#fff', padding: '52px 56px',
              fontFamily: "'DM Sans', sans-serif", color: '#1a1a2e',
              minHeight: 900,
            }}>

              {/* Branded header */}
              <div style={{
                background: accent, borderRadius: 14,
                padding: '32px 36px', marginBottom: 44,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{
                    fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800,
                    color: '#fff', letterSpacing: '-0.5px', marginBottom: 6,
                  }}>{companyName}</div>
                  {settings.company_email && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>{settings.company_email}</div>}
                  {settings.company_phone && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>{settings.company_phone}</div>}
                  {settings.company_address && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{settings.company_address}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>Invoice</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
                    {invoice.invoice_number}
                  </div>
                </div>
              </div>

              {/* Bill to + dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36, marginBottom: 44 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#999', marginBottom: 10 }}>Bill To</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 5 }}>{invoice.client_name}</div>
                  {invoice.client_email && <div style={{ fontSize: 13, color: '#666' }}>{invoice.client_email}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#999', marginBottom: 4 }}>Issue Date</div>
                    <div style={{ fontSize: 14, color: '#444' }}>{issueDate}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#999', marginBottom: 4 }}>Due Date</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{invoice.due_date}</div>
                  </div>
                </div>
              </div>

              {/* Line items */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: '12px 18px', textAlign: 'left',
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.8px', color: '#999',
                      background: '#f7f7fb',
                      borderBottom: `2px solid ${accent}`,
                    }}>Description</th>
                    <th style={{
                      padding: '12px 18px', textAlign: 'right',
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.8px', color: '#999',
                      background: '#f7f7fb',
                      borderBottom: `2px solid ${accent}`,
                      width: 160,
                    }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '22px 18px', borderBottom: '1px solid #f0f0f6', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e', marginBottom: 6 }}>
                        {invoice.stage
                          ? `${invoice.stage}${invoice.project_title ? ` — ${invoice.project_title}` : ''}`
                          : (invoice.project_title || 'Professional Services')}
                      </div>
                      {invoice.stage_description && (
                        <div style={{ fontSize: 13, color: '#666', lineHeight: 1.65 }}>
                          {invoice.stage_description}
                        </div>
                      )}
                    </td>
                    <td style={{
                      padding: '22px 18px', borderBottom: '1px solid #f0f0f6',
                      textAlign: 'right', fontWeight: 700, fontSize: 15, color: '#1a1a2e',
                      verticalAlign: 'top',
                    }}>
                      ${fmt(lineAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Subtotal / Total block */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
                <div style={{ width: 280 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid #f0f0f6' }}>
                    <span style={{ fontSize: 13, color: '#888' }}>Subtotal</span>
                    <span style={{ fontSize: 13, color: '#444', fontWeight: 600 }}>${fmt(lineAmount)}</span>
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '14px 18px',
                    background: '#f7f7fb', borderRadius: '0 0 10px 10px',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Total Due</span>
                    <span style={{
                      fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: accent,
                    }}>${fmt(lineAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Payment details */}
              {(settings.bank_bsb || settings.paypal_link || settings.stripe_link) && (
                <div style={{
                  padding: '20px 24px', background: '#f7f7fb',
                  borderRadius: 10, borderLeft: `4px solid ${accent}`, marginBottom: 32,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#888', marginBottom: 12 }}>
                    Payment Details
                  </div>
                  {settings.bank_bsb && (
                    <div style={{ fontSize: 13, color: '#333', marginBottom: 5 }}>
                      <strong>Bank Transfer</strong> — BSB: {settings.bank_bsb} &nbsp;·&nbsp; Account: {settings.bank_account}
                      {settings.bank_name && <span> &nbsp;·&nbsp; {settings.bank_name}</span>}
                    </div>
                  )}
                  {settings.paypal_link && (
                    <div style={{ fontSize: 13, color: '#333', marginBottom: 5 }}>
                      <strong>PayPal:</strong> {settings.paypal_link}
                    </div>
                  )}
                  {settings.stripe_link && (
                    <div style={{ fontSize: 13, color: '#333' }}>
                      <strong>Stripe:</strong> {settings.stripe_link}
                    </div>
                  )}
                  {settings.payment_terms && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 12, paddingTop: 12, borderTop: '1px solid #e8e8f0' }}>
                      {settings.payment_terms}
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div style={{ paddingTop: 20, borderTop: '1px solid #eee', fontSize: 12, color: '#bbb', textAlign: 'center' }}>
                {settings.invoice_footer || `Thank you for your business — ${companyName}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
