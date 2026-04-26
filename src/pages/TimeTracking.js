import React, { useState, useEffect } from 'react';
import { TimeAPI, ProjectsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Trash2, X, Clock, TrendingUp } from 'lucide-react';
import { format, startOfWeek, isAfter } from 'date-fns';

const STAGES = ['Discovery', 'Design', 'Development', 'Testing', 'Deployment', 'Training', 'General'];

export default function TimeTracking() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    project_id: '', project_title: '', stage: 'General',
    description: '', hours: '', billable: 'true',
    date: format(new Date(), 'yyyy-MM-dd'), team_member: '',
  });

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [e, p] = await Promise.all([TimeAPI.list(), ProjectsAPI.list()]);
      setEntries(e.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setProjects(p);
    } catch { toast.error('Failed to load time entries'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const project = projects.find(p => p.id === form.project_id);
      const entry = await TimeAPI.create({
        ...form,
        project_title: project?.title || form.project_title,
      });
      setEntries(prev => [entry, ...prev]);
      setShowModal(false);
      toast.success('Time logged');
    } catch { toast.error('Failed to log time'); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await TimeAPI.delete(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  }

  const filtered = entries.filter(e => {
    const matchSearch = !search || (e.description || '').toLowerCase().includes(search.toLowerCase()) || (e.project_title || '').toLowerCase().includes(search.toLowerCase());
    const matchProject = filterProject === 'all' || e.project_id === filterProject;
    return matchSearch && matchProject;
  });

  const weekStart = startOfWeek(new Date());
  const totalHours = entries.reduce((s, e) => s + parseFloat(e.hours || 0), 0);
  const billableHours = entries.filter(e => e.billable === 'true').reduce((s, e) => s + parseFloat(e.hours || 0), 0);
  const weekHours = entries.filter(e => e.date && isAfter(new Date(e.date), weekStart)).reduce((s, e) => s + parseFloat(e.hours || 0), 0);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Time Tracking</h1>
          <p className="page-subtitle">Track time across projects and stages</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Log Time
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}><Clock size={18} color="var(--accent-light)" /></div>
          <div className="stat-label">Total Hours</div>
          <div className="stat-value">{totalHours.toFixed(1)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-dim)' }}><TrendingUp size={18} color="var(--success)" /></div>
          <div className="stat-label">Billable Hours</div>
          <div className="stat-value">{billableHours.toFixed(1)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--info-dim)' }}><Clock size={18} color="var(--info)" /></div>
          <div className="stat-label">This Week</div>
          <div className="stat-value">{weekHours.toFixed(1)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-dim)' }}><TrendingUp size={18} color="var(--warning)" /></div>
          <div className="stat-label">Billable %</div>
          <div className="stat-value">{totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0}%</div>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <Search size={14} />
          <input placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={{ width: 'auto', padding: '6px 12px' }} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Stage</th>
                <th>Description</th>
                <th>Team Member</th>
                <th>Hours</th>
                <th>Billable</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><p>No time entries found</p></div></td></tr>
              ) : filtered.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td style={{ fontWeight: 500 }}>{e.project_title}</td>
                  <td><span className="badge badge-muted" style={{ fontSize: 10 }}>{e.stage}</span></td>
                  <td style={{ maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{e.description}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{e.team_member}</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent-light)' }}>{parseFloat(e.hours || 0).toFixed(1)}h</td>
                  <td>
                    <span className={`badge ${e.billable === 'true' ? 'badge-success' : 'badge-muted'}`}>
                      {e.billable === 'true' ? 'Yes' : 'No'}
                    </span>
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Log Time</h2>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Project *</label>
                  <select value={form.project_id} onChange={e => {
                    const p = projects.find(pr => pr.id === e.target.value);
                    setForm(f => ({ ...f, project_id: e.target.value, project_title: p?.title || '' }));
                  }} required>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Stage</label>
                  <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description *</label>
                <input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you work on?" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Hours *</label>
                  <input type="number" step="0.25" required value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="2.5" min="0.25" />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Team Member</label>
                  <input value={form.team_member} onChange={e => setForm(f => ({ ...f, team_member: e.target.value }))} placeholder="Name" />
                </div>
                <div className="form-group">
                  <label>Billable</label>
                  <select value={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.value }))}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Log Time</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
