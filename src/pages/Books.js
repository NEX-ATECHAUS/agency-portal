import React, { useState, useEffect } from 'react';
import { ExpensesAPI, InvoicesAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Trash2, X, TrendingUp, TrendingDown, DollarSign, Mail, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';



const EXPENSE_CATEGORIES = ['Software', 'Travel', 'Office', 'Marketing', 'Hardware', 'Contractor', 'Subscriptions', 'Food', 'Other'];

export default function Books() {
  const toast = useToast();
  const [expenses, setExpenses] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning]     = useState(false);
  const [showScanMenu, setShowScanMenu] = useState(false);
  const [lastScanned, setLastScanned]   = useState(() => localStorage.getItem('inbox_last_scanned') || null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('overview');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    description: '', category: 'Software', amount: '',
    date: format(new Date(), 'yyyy-MM-dd'), receipt_url: '', project_id: '', notes: '',
  });

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showScanMenu) return;
    const close = () => setShowScanMenu(false);
    // setTimeout prevents the opening click from immediately closing the menu
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', close); };
  }, [showScanMenu]);

  async function loadData() {
    setLoading(true);
    try {
      const [e, i] = await Promise.all([ExpensesAPI.list(), InvoicesAPI.list()]);
      setExpenses(e.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setInvoices(i);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }

  async function scanInbox(fromDate) {
    setScanning(true);
    setShowScanMenu(false);
    try {
      const res = await fetch('/api/inbox/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      const now = new Date().toISOString();
      localStorage.setItem('inbox_last_scanned', now);
      setLastScanned(now);
      if (data.added > 0) {
        toast.success(`Added ${data.added} expense${data.added !== 1 ? 's' : ''} from inbox`);
        await loadData();
      } else {
        toast.success(`Scanned — no new invoices found (${data.threads_found || 0} emails checked)`);
      }
    } catch (err) {
      toast.error('Scan failed: ' + err.message);
    }
    setScanning(false);
  }

  function getScanOptions() {
    const opts = [];
    if (lastScanned) {
      const d = new Date(lastScanned);
      opts.push({
        label: `Since last scan (${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })})`,
        value: lastScanned,
        highlight: true,
      });
    }
    const now = new Date();
    const ago = (days) => new Date(now - days * 86400000).toISOString();
    opts.push(
      { label: 'Last 30 days',   value: ago(30) },
      { label: 'Last 3 months',  value: ago(90) },
      { label: 'Last 6 months',  value: ago(180) },
      { label: 'Last 12 months', value: ago(365) },
      { label: 'Last 2 years',   value: ago(730) },
      { label: 'All time',       value: ago(3650) },
    );
    return opts;
  }

  async function handleCreate(ev) {
    ev.preventDefault();
    try {
      const expense = await ExpensesAPI.create(form);
      setExpenses(prev => [expense, ...prev]);
      setShowModal(false);
      toast.success('Expense added');
    } catch { toast.error('Failed to add expense'); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await ExpensesAPI.delete(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch { toast.error('Failed to delete'); }
  }

  const revenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const netProfit = revenue - totalExpenses;

  const expensesByCategory = EXPENSE_CATEGORIES.map(cat => ({
    category: cat,
    amount: expenses.filter(e => e.category === cat).reduce((s, e) => s + parseFloat(e.amount || 0), 0),
  })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);

  const filteredExpenses = expenses.filter(e =>
    !search || (e.description || '').toLowerCase().includes(search.toLowerCase()) || (e.category || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Books</h1>
          <p className="page-subtitle">Financial overview & expense tracking</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary" onClick={() => !scanning && setShowScanMenu(s => !s)} disabled={scanning}
              style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {scanning
                ? <><RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Scanning...</>
                : <><Mail size={14} /> Scan Inbox <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span></>}
            </button>
            {showScanMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                borderRadius: 10, boxShadow: 'var(--shadow)', minWidth: 240, overflow: 'hidden',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '10px 14px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Scan from...
                </div>
                {getScanOptions().map(opt => (
                  <button key={opt.value} onClick={() => scanInbox(opt.value)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '9px 14px', background: opt.highlight ? 'var(--accent-dim)' : 'none',
                      border: 'none', borderTop: opt.highlight ? '1px solid var(--border)' : 'none',
                      color: opt.highlight ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 13, fontWeight: opt.highlight ? 600 : 400, cursor: 'pointer',
                    }}>
                    {opt.highlight && '⟳ '}{opt.label}
                  </button>
                ))}
                {lastScanned && (
                  <div style={{ padding: '6px 14px 10px', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                    Last scanned: {new Date(lastScanned).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* P&L summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-dim)' }}><TrendingUp size={18} color="var(--success)" /></div>
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>${revenue.toLocaleString()}</div>
          <div className="stat-change">From paid invoices</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--danger-dim)' }}><TrendingDown size={18} color="var(--danger)" /></div>
          <div className="stat-label">Total Expenses</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>${totalExpenses.toLocaleString()}</div>
          <div className="stat-change">{expenses.length} expense records</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: netProfit >= 0 ? 'var(--success-dim)' : 'var(--danger-dim)' }}>
            <DollarSign size={18} color={netProfit >= 0 ? 'var(--success)' : 'var(--danger)'} />
          </div>
          <div className="stat-label">Net Profit</div>
          <div className="stat-value" style={{ color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {netProfit < 0 ? '-' : ''}${Math.abs(netProfit).toLocaleString()}
          </div>
          <div className="stat-change">{revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0}% margin</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {['overview', 'expenses'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'none', border: 'none',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t ? 'var(--accent-light)' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 13, fontWeight: 500, textTransform: 'capitalize', marginBottom: -1,
          }}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* By category */}
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>Expenses by Category</h3>
            {expensesByCategory.length === 0 ? (
              <div className="empty-state"><p>No expenses yet</p></div>
            ) : expensesByCategory.map(c => (
              <div key={c.category} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>{c.category}</span>
                  <span style={{ fontWeight: 600 }}>${c.amount.toLocaleString()}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0}%`, background: 'var(--danger)' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Recent expenses */}
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>Recent Expenses</h3>
            {expenses.slice(0, 8).map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{e.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.category} · {e.date}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}>-${parseFloat(e.amount || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <>
          <div className="filters-bar">
            <div className="search-box">
              <Search size={14} />
              <input placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Receipt</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.length === 0 ? (
                    <tr><td colSpan={6}><div className="empty-state"><p>No expenses found</p></div></td></tr>
                  ) : filteredExpenses.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.date}</td>
                      <td style={{ fontWeight: 500 }}>{e.description}</td>
                      <td><span className="badge badge-muted" style={{ fontSize: 10 }}>{e.category}</span></td>
                      <td style={{ fontWeight: 600, color: 'var(--danger)' }}>-${parseFloat(e.amount || 0).toLocaleString()}</td>
                      <td>
                        {e.receipt_url ? (
                          <a href={e.receipt_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-light)', fontSize: 12 }}>View</a>
                        ) : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(e.id)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Expense</h2>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
              <div className="form-group">
                <label>Description *</label>
                <input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="E.g. Adobe Creative Cloud" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount ($) *</label>
                  <input type="number" step="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="99.00" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Receipt URL</label>
                  <input value={form.receipt_url} onChange={e => setForm(f => ({ ...f, receipt_url: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
