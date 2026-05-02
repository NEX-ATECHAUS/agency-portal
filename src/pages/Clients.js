import React, { useState, useEffect, useRef } from 'react';
import { ClientsAPI, ProjectsAPI, InvoicesAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, X, Upload, Download, Mail, Phone, Building, Edit2, Trash2 } from 'lucide-react';



export default function Clients() {
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const fileRef = useRef();
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', address: '', notes: '' });

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [c, p, i] = await Promise.all([ClientsAPI.list(), ProjectsAPI.list(), InvoicesAPI.list()]);
      setClients(c);
      setProjects(p);
      setInvoices(i);
    } catch { toast.error('Failed to load clients'); }
    finally { setLoading(false); }
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      if (editingClient) {
        const updated = await ClientsAPI.update(editingClient.id, form);
        setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
        if (selected?.id === updated.id) setSelected(updated);
        toast.success('Client updated');
      } else {
        const client = await ClientsAPI.create(form);
        setClients(prev => [...prev, client]);
        toast.success('Client added');
      }
      setShowModal(false);
      setEditingClient(null);
      setForm({ name: '', email: '', phone: '', company: '', address: '', notes: '' });
    } catch { toast.error('Failed to save client'); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this client? This will not delete their projects or invoices.')) return;
    try {
      await ClientsAPI.delete(id);
      setClients(prev => prev.filter(c => c.id !== id));
      if (selected?.id === id) setSelected(null);
      toast.success('Client deleted');
    } catch { toast.error('Failed to delete'); }
  }

  function handleEdit(client) {
    setForm({ name: client.name, email: client.email, phone: client.phone, company: client.company, address: client.address, notes: client.notes });
    setEditingClient(client);
    setShowModal(true);
  }

  function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const lines = ev.target.result.split('\n').filter(Boolean);
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      let imported = 0;
      for (const line of lines.slice(1)) {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        if (obj.name || obj.email) {
          await ClientsAPI.create({ name: obj.name || '', email: obj.email || '', phone: obj.phone || '', company: obj.company || '', address: obj.address || '', notes: obj.notes || '' });
          imported++;
        }
      }
      toast.success(`Imported ${imported} clients`);
      loadData();
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function downloadTemplate() {
    const csv = 'name,email,phone,company,address,notes\nJohn Smith,john@example.com,0400000000,Acme Corp,123 Main St,VIP client';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'clients_template.csv'; a.click();
  }

    const filtered = clients.filter(c =>
    !search || (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(search.toLowerCase())
  );

  const clientProjects = selected ? projects.filter(p => p.client_id === selected.id) : [];
  const clientRevenue = selected ? invoices.filter(i => i.client_id === selected.id && i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0) : 0;

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', overflow: 'hidden' }}>

    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Client list */}
      <div style={{ width: 320, borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16 }}>Clients <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>({clients.length})</span></h2>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={downloadTemplate} title="Download CSV template"><Download size={14} /></button>
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} title="Import CSV"><Upload size={14} /></button>
              <button className="btn btn-primary btn-sm" onClick={() => { setEditingClient(null); setForm({ name: '', email: '', phone: '', company: '', address: '', notes: '' }); setShowModal(true); }}>
                <Plus size={14} />
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
          <div className="search-box" style={{ maxWidth: '100%' }}>
            <Search size={14} />
            <input placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div className="empty-state"><p>No clients found</p></div>
          ) : filtered.map(client => (
            <div
              key={client.id}
              onClick={() => setSelected(client)}
              style={{
                padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: selected?.id === client.id ? 'var(--accent-dim)' : 'transparent',
                borderRight: selected?.id === client.id ? '3px solid var(--accent)' : '3px solid transparent',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent-light)', fontWeight: 700, fontSize: 14, flexShrink: 0,
                  fontFamily: 'var(--font-display)',
                }}>
                  {(client.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.company || client.email}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Client detail */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        {!selected ? (
          <div className="empty-state" style={{ marginTop: 80 }}>
            <Users48 />
            <h3>Select a client</h3>
            <p>Choose a client to view their details and projects</p>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent-light)', fontWeight: 800, fontSize: 22,
                  fontFamily: 'var(--font-display)',
                }}>
                  {(selected.name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: 22 }}>{selected.name}</h2>
                  {selected.company && <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{selected.company}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(selected)}><Edit2 size={14} /> Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected.id)}><Trash2 size={14} /></button>
              </div>
            </div>

            {/* Contact info */}
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, marginBottom: 16 }}>Contact Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {selected.email && <InfoRow icon={<Mail size={14} />} value={selected.email} />}
                {selected.phone && <InfoRow icon={<Phone size={14} />} value={selected.phone} />}
                {selected.company && <InfoRow icon={<Building size={14} />} value={selected.company} />}
                {selected.address && <InfoRow icon={<span style={{ fontSize: 12 }}>📍</span>} value={selected.address} />}
              </div>
              {selected.notes && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>{selected.notes}</div>}
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              <div className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-light)' }}>{clientProjects.length}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Projects</div>
              </div>
              <div className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--success)' }}>${clientRevenue.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Revenue</div>
              </div>
              <div className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--info)' }}>
                  {invoices.filter(i => i.client_id === selected.id).length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Invoices</div>
              </div>
            </div>

            {/* Projects */}
            {clientProjects.length > 0 && (
              <div className="card">
                <h3 style={{ fontSize: 14, marginBottom: 16 }}>Projects</h3>
                {clientProjects.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.type} · {p.current_stage}</div>
                    </div>
                    <span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-muted'}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingClient ? 'Edit Client' : 'New Client'}</h2>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Name *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@company.com" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0400 000 000" />
                </div>
                <div className="form-group">
                  <label>Company</label>
                  <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Company name" />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingClient ? 'Update' : 'Create Client'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function InfoRow({ icon, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  );
}

function Users48() {
  return <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', marginBottom: 12 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
}
