import React, { useState, useEffect, useCallback } from 'react';
import { SoftwareStackAPI, ClientsAPI, ProjectsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, X, RefreshCw, Globe, AlertTriangle, CheckCircle, Clock, Sparkles } from 'lucide-react';


function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw.includes('T') ? raw : raw + 'T12:00:00');
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}

const CATEGORIES = ['CRM', 'Project Management', 'Communication', 'Accounting', 'Design', 'Development', 'Marketing', 'Analytics', 'Security', 'Storage', 'Automation', 'Other'];

export default function SoftwareStack() {
  const toast = useToast();
  const [stack, setStack]         = useState([]);
  const [clients, setClients]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [checking, setChecking]   = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [filterClient, setFilterClient] = useState('all');
  const [form, setForm] = useState({ client_id: '', app_name: '', category: 'Other', url: '', version: '', notes: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([SoftwareStackAPI.list(), ClientsAPI.list()]);
      setStack(s.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || '')));
      setClients(c);
    } catch { toast.error('Failed to load software stack'); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const [detecting, setDetecting]   = useState(false);
  const [detectResults, setDetectResults] = useState(null);
  const [detectProject, setDetectProject] = useState('');
  const [projects, setProjects]     = useState([]);
  const [showDetect, setShowDetect] = useState(false);
  const [addingApp, setAddingApp]   = useState(null);
  const [addedApps, setAddedApps]   = useState(new Set());

  useEffect(() => {
    ProjectsAPI.list().then(setProjects).catch(() => {});
  }, []);

  async function detectApps() {
    if (!detectProject) { toast.error('Select a project first'); return; }
    setDetecting(true);
    setDetectResults(null);
    try {
      const proj = projects.find(p => p.id === detectProject);
      const res = await fetch('/api/software/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: detectProject, client_id: proj?.client_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Detection failed');
      setDetectResults(data);
      if (!data.new_apps?.length) toast.success(`Scanned — ${data.already_tracked?.length || 0} apps already tracked, nothing new found`);
      else toast.success(`Found ${data.new_apps.length} new app${data.new_apps.length !== 1 ? 's' : ''} for ${data.client_name}`);
    } catch (err) { toast.error('Detection failed: ' + err.message); }
    setDetecting(false);
  }

  async function addDetectedApp(app) {
    setAddingApp(app.app_name);
    try {
      const proj = projects.find(p => p.id === detectProject);
      const client = clients.find(c => c.id === proj?.client_id);
      const entry = await SoftwareStackAPI.create({
        client_id: proj?.client_id || '',
        client_name: client?.name || detectResults?.client_name || '',
        app_name: app.app_name,
        category: app.category || 'Other',
        url: app.url || '',
        version: '',
        notes: app.evidence || '',
        last_checked: '',
        last_update_found: '',
        update_summary: '',
        created_at: new Date().toISOString(),
      });
      setStack(prev => [...prev, entry].sort((a, b) => (a.client_name||'').localeCompare(b.client_name||'')));
      setAddedApps(prev => new Set([...prev, app.app_name]));
      toast.success(`${app.app_name} added to stack`);
    } catch (err) { toast.error('Failed: ' + err.message); }
    setAddingApp(null);
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const client = clients.find(c => c.id === form.client_id);
      const entry = await SoftwareStackAPI.create({
        ...form,
        client_name: client?.name || '',
        last_checked: '',
        last_update_found: '',
        update_summary: '',
        created_at: new Date().toISOString(),
      });
      setStack(prev => [...prev, entry].sort((a, b) => (a.client_name || '').localeCompare(b.client_name || '')));
      setShowModal(false);
      setForm({ client_id: '', app_name: '', category: 'Other', url: '', version: '', notes: '' });
      toast.success(`${entry.app_name} added to stack`);
    } catch { toast.error('Failed to add'); }
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Remove ${entry.app_name}?`)) return;
    try {
      await SoftwareStackAPI.delete(entry.id);
      setStack(prev => prev.filter(s => s.id !== entry.id));
      toast.success('Removed');
    } catch { toast.error('Failed to remove'); }
  }

  async function runCheck() {
    setChecking(true);
    try {
      const res = await fetch('/api/software/check', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      toast.success(`Checked ${data.checked} apps · ${data.updates_found} update${data.updates_found !== 1 ? 's' : ''} found · ${data.emails_sent} email${data.emails_sent !== 1 ? 's' : ''} sent`);
      await loadData();
    } catch (err) { toast.error('Check failed: ' + err.message); }
    setChecking(false);
  }

  // Group by client
  const grouped = {};
  const filtered = filterClient === 'all' ? stack : stack.filter(s => s.client_id === filterClient);
  filtered.forEach(s => {
    const key = s.client_name || 'No Client';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  const totalWithUpdates = stack.filter(s => s.update_summary).length;

  if (loading) return <div className="loading-center" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Software Stack</h1>
          <p className="page-subtitle">{stack.length} apps tracked across {Object.keys(grouped).length} clients{totalWithUpdates > 0 ? ` · ${totalWithUpdates} with updates` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => { setShowDetect(s => !s); setDetectResults(null); setAddedApps(new Set()); }}>
            <Sparkles size={14} /> Detect Apps
          </button>
          <button className="btn btn-secondary" onClick={runCheck} disabled={checking}>
            {checking ? <><RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Checking...</> : <><Globe size={14} /> Run Update Check</>}
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Add App
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="card" style={{ padding: '14px 20px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Clock size={16} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Weekly auto-check runs every Monday at 9am.</strong> When important updates are found, clients receive an automated email. Click "Run Update Check" to check now.
        </div>
      </div>

      {/* Detect panel */}
      {showDetect && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>AI App Detection</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Scan a project's details, proposal and emails to auto-detect apps in use</p>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setShowDetect(false); setDetectResults(null); }}><X size={14} /></button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: detectResults ? 20 : 0 }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label>Select Project</label>
              <select value={detectProject} onChange={e => { setDetectProject(e.target.value); setDetectResults(null); setAddedApps(new Set()); }} style={{ marginBottom: 0 }}>
                <option value="">Choose a project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title} {p.client_name ? `(${p.client_name})` : ''}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={detectApps} disabled={detecting || !detectProject} style={{ flexShrink: 0 }}>
              {detecting ? <><RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Scanning...</> : <><Sparkles size={14} /> Detect</>}
            </button>
          </div>

          {detectResults && (
            <div>
              {detectResults.already_tracked?.length > 0 && (
                <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  Already tracked: {detectResults.already_tracked.join(', ')}
                </div>
              )}
              {detectResults.new_apps?.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>No new apps detected</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detectResults.new_apps.map(app => {
                    const isAdded = addedApps.has(app.app_name);
                    return (
                      <div key={app.app_name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: `1px solid ${isAdded ? 'var(--success)' : 'var(--border)'}`, borderRadius: 8, background: isAdded ? 'var(--success-dim)' : 'var(--bg-elevated)' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--accent-light)', flexShrink: 0 }}>
                          {app.app_name[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{app.app_name}</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>{app.category}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{app.evidence}</span>
                          </div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {isAdded ? (
                            <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>✓ Added</span>
                          ) : (
                            <button className="btn btn-primary btn-sm" onClick={() => addDetectedApp(app)} disabled={addingApp === app.app_name}>
                              {addingApp === app.app_name ? '...' : <><Plus size={12} /> Add</>}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${filterClient === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilterClient('all')}>All Clients ({stack.length})</button>
        {clients.filter(c => stack.some(s => s.client_id === c.id)).map(c => (
          <button key={c.id} className={`btn btn-sm ${filterClient === c.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterClient(c.id)}>
            {c.name} ({stack.filter(s => s.client_id === c.id).length})
          </button>
        ))}
      </div>

      {/* Stack by client */}
      {Object.keys(grouped).length === 0 ? (
        <div className="card"><div className="empty-state"><p>No apps in the stack yet. Add apps for each client to start tracking updates.</p></div></div>
      ) : (
        Object.entries(grouped).map(([clientName, apps]) => (
          <div key={clientName} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Client header */}
            <div style={{ padding: '14px 24px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{clientName}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{apps.length} app{apps.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Apps grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 0 }}>
              {apps.map((app, i) => {
                const hasUpdate = !!app.update_summary;
                const lastCheckedDate = fmtDate(app.last_checked);
                return (
                  <div key={app.id} style={{
                    padding: '16px 20px',
                    borderRight: (i + 1) % 3 !== 0 ? '1px solid var(--border)' : 'none',
                    borderBottom: '1px solid var(--border)',
                    position: 'relative',
                  }}>
                    {/* Update indicator */}
                    {hasUpdate && (
                      <div style={{ position: 'absolute', top: 12, right: 12 }}>
                        <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                      {/* App icon placeholder */}
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent-light)', flexShrink: 0 }}>
                        {app.app_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{app.app_name}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge badge-gray" style={{ fontSize: 10 }}>{app.category}</span>
                          {app.version && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>v{app.version}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Update summary */}
                    {hasUpdate ? (
                      <div style={{ padding: '8px 10px', background: 'var(--warning-dim)', borderRadius: 6, marginBottom: 8, fontSize: 11, color: 'var(--warning)', lineHeight: 1.5 }}>
                        {app.update_summary}
                      </div>
                    ) : app.last_checked ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--success)', marginBottom: 8 }}>
                        <CheckCircle size={11} /> No issues found · {lastCheckedDate}
                      </div>
                    ) : null}

                    {app.url && (
                      <a href={app.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                        {app.url}
                      </a>
                    )}
                    {app.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{app.notes}</div>}

                    {/* Delete */}
                    <button onClick={() => handleDelete(app)}
                      style={{ position: 'absolute', bottom: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.5, padding: 4 }}
                      title="Remove">
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Add modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add App to Stack</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Client *</label>
                  <select required value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                    <option value="">Select client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>App Name *</label>
                    <input required value={form.app_name} onChange={e => setForm(f => ({ ...f, app_name: e.target.value }))} placeholder="e.g. HubSpot, Xero, Slack" />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>URL</label>
                    <input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://app.com" />
                  </div>
                  <div className="form-group">
                    <label>Version</label>
                    <input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="e.g. 3.2.1" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="How is this app used, any important context..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add to Stack</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
