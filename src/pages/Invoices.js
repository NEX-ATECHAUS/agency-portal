import React, { useState, useEffect, useRef } from 'react';
import { InvoicesAPI, ClientsAPI, ProjectsAPI, SettingsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Send, CheckSquare, Download, X, Eye } from 'lucide-react';
import { format, addDays } from 'date-fns';

const STATUS_COLORS = { draft: 'badge-muted', sent: 'badge-info', paid: 'badge-success', overdue: 'badge-danger' };

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
  const [form, setForm] = useState({
    invoice_number: `INV-${Date.now()}`,
    project_id: '', project_title: '', client_id: '', client_name: '', client_email: '',
    stage: '', stage_description: '', amount: '', due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'), notes: ''
  });

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [inv, c, p, s] = await Promise.all([InvoicesAPI.list(), ClientsAPI.list(), ProjectsAPI.list(), SettingsAPI.getAll()]);
      setInvoices(inv.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setClients(c); setProjects(p); setSettings(s);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const client = clients.find(c => c.id === form.client_id);
      const project = projects.find(p => p.id === form.project_id);
      const invoice = await InvoicesAPI.create({
        ...form,
        client_name: client?.name || form.client_name,
        client_email: client?.email || form.client_email,
        project_title: project?.title || form.project_title,
      });
      setInvoices(prev => [invoice, ...prev]);
      setShowModal(false);
      toast.success('Invoice created');
    } catch (err) { toast.error('Failed to create invoice'); }
  }

  async function handleSend(invoice) {
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: invoice.client_email,
          subject: `Invoice ${invoice.invoice_number}`,
          body: `Dear ${invoice.client_name},\n\nPlease find attached your invoice ${invoice.invoice_number} for $${parseFloat(invoice.amount).toLocaleString()}.\n\nDue date: ${invoice.due_date}\n\nThank you for your business.\n\n${settings.company_name || ''}`,
          type: 'invoice',
        }),
      });
      if (!res.ok) throw new Error('Email failed');
      const updated = await InvoicesAPI.update(invoice.id, { status: 'sent' });
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      toast.success('Invoice sent!');
    } catch { toast.error('Failed to send invoice'); }
  }

  async function handleMarkPaid(invoice) {
    try {
      const updated = await InvoicesAPI.update(invoice.id, { status: 'paid', paid_at: new Date().toISOString() });
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      toast.success('Marked as paid');
    } catch { toast.error('Failed to update'); }
  }

  const filtered = invoices.filter(i => {
    const matchSearch = !search || (i.invoice_number || '').toLowerCase().includes(search.toLowerCase()) || (i.client_name || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || i.status === filter;
    return matchSearch && matchFilter;
  });

  const totalByStatus = (status) => invoices.filter(i => i.status === status).reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{invoices.length} total invoices</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Draft', status: 'draft', color: 'var(--text-muted)' },
          { label: 'Sent', status: 'sent', color: 'var(--info)' },
          { label: 'Paid', status: 'paid', color: 'var(--success)' },
          { label: 'Overdue', status: 'overdue', color: 'var(--danger)' },
        ].map(s => (
          <div key={s.status} className="card" style={{ padding: '14px 16px', cursor: 'pointer', borderColor: filter === s.status ? s.color : undefined }}
            onClick={() => setFilter(f => f === s.status ? 'all' : s.status)}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: s.color }}>
              ${totalByStatus(s.status).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <Search size={14} />
          <input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['all', 'draft', 'sent', 'paid', 'overdue'].map(s => (
          <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Project / Stage</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state"><p>No invoices found</p></div></td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} onClick={() => setPreviewInvoice(inv)}>
                  <td style={{ fontWeight: 600, color: 'var(--accent-light)', fontFamily: 'var(--font-display)' }}>{inv.invoice_number}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{inv.client_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inv.client_email}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12 }}>{inv.project_title}</div>
                    {inv.stage && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inv.stage}</div>}
                  </td>
                  <td style={{ fontWeight: 600 }}>${parseFloat(inv.amount || 0).toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{inv.due_date}</td>
                  <td><span className={`badge ${STATUS_COLORS[inv.status] || 'badge-muted'}`}>{inv.status}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPreviewInvoice(inv)} title="Preview"><Eye size={12} /></button>
                      {inv.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleSend(inv)}>
                          <Send size={12} /> Send
                        </button>
                      )}
                      {(inv.status === 'sent' || inv.status === 'overdue') && (
                        <button className="btn btn-success btn-sm" onClick={() => handleMarkPaid(inv)}>
                          <CheckSquare size={12} /> Paid
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Invoice</h2>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Invoice Number</label>
                  <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} />
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
                  <label>Project</label>
                  <select value={form.project_id} onChange={e => {
                    const p = projects.find(pr => pr.id === e.target.value);
                    setForm(f => ({ ...f, project_id: e.target.value, project_title: p?.title || '' }));
                  }}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount ($) *</label>
                  <input type="number" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="5000" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Stage</label>
                  <input value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} placeholder="E.g. Discovery" />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea rows={3} value={form.stage_description} onChange={e => setForm(f => ({ ...f, stage_description: e.target.value }))} placeholder="Invoice description..." />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewInvoice && (
        <InvoicePreview invoice={previewInvoice} settings={settings} onClose={() => setPreviewInvoice(null)} />
      )}
    </div>
  );
}

function InvoicePreview({ invoice, settings, onClose }) {
  const printRef = useRef();

  function handlePrint() {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${invoice.invoice_number}</title><style>
      body { font-family: 'DM Sans', sans-serif; padding: 40px; color: #1a1a2e; }
      h1 { font-family: Syne, sans-serif; }
      .label { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
      table { width: 100%; border-collapse: collapse; }
      td, th { padding: 10px 0; border-bottom: 1px solid #eee; }
      .total { font-size: 24px; font-weight: 700; color: #6c63ff; }
    </style></head><body>${printRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Invoice Preview</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrint}><Download size={14} /> Print / PDF</button>
            <button onClick={onClose} className="btn btn-ghost btn-sm"><X size={16} /></button>
          </div>
        </div>
        <div ref={printRef} style={{ background: 'white', borderRadius: 12, padding: 32, color: '#1a1a2e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, color: '#6c63ff', marginBottom: 4 }}>{settings.company_name || 'Agency'}</h1>
              <div style={{ fontSize: 13, color: '#666' }}>{settings.email}</div>
              <div style={{ fontSize: 13, color: '#666' }}>{settings.phone}</div>
              <div style={{ fontSize: 13, color: '#666' }}>{settings.address}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Invoice</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>{invoice.invoice_number}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Bill To</div>
              <div style={{ fontWeight: 600 }}>{invoice.client_name}</div>
              <div style={{ fontSize: 13, color: '#555' }}>{invoice.client_email}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#888' }}>Issue Date: </span>
                <span style={{ fontSize: 13 }}>{invoice.created_at ? invoice.created_at.split('T')[0] : ''}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#888' }}>Due Date: </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{invoice.due_date}</span>
              </div>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '10px 0', fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Description</th>
                <th style={{ textAlign: 'right', padding: '10px 0', fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '16px 0' }}>
                  <div style={{ fontWeight: 600 }}>{invoice.stage || 'Services'}</div>
                  <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{invoice.stage_description || invoice.notes}</div>
                  {invoice.project_title && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Project: {invoice.project_title}</div>}
                </td>
                <td style={{ padding: '16px 0', textAlign: 'right', fontWeight: 600 }}>
                  ${parseFloat(invoice.amount || 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '2px solid #eee', paddingTop: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#888' }}>Total Due</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#6c63ff', fontFamily: 'Syne, sans-serif' }}>
                ${parseFloat(invoice.amount || 0).toLocaleString()}
              </div>
            </div>
          </div>
          {settings.bank_bsb && (
            <div style={{ marginTop: 32, padding: 16, background: '#f8f9ff', borderRadius: 10, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Payment Details</div>
              <div>BSB: {settings.bank_bsb} · Account: {settings.bank_account}</div>
              {settings.paypal && <div>PayPal: {settings.paypal}</div>}
            </div>
          )}
          {settings.invoice_footer && (
            <div style={{ marginTop: 24, fontSize: 12, color: '#888', borderTop: '1px solid #eee', paddingTop: 16 }}>
              {settings.invoice_footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
