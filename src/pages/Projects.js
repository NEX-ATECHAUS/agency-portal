import React, { useState, useEffect } from 'react';
import { ProjectsAPI, ClientsAPI, InvoicesAPI, NotificationsAPI, AIAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, CheckCircle, Circle, ChevronRight, X, DollarSign, Calendar } from 'lucide-react';
import { format, addDays } from 'date-fns';

const STAGES = ['Discovery', 'Design', 'Development', 'Testing', 'Deployment', 'Training'];
const STAGE_PERCENTAGES = { Discovery: 15, Design: 20, Development: 30, Testing: 15, Deployment: 15, Training: 5 };
const STATUS_OPTIONS = ['active', 'completed', 'on-hold', 'cancelled'];
const TYPE_OPTIONS = ['Web Development', 'Mobile App', 'Design', 'Branding', 'SEO', 'Consulting', 'Other'];

export default function Projects() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [form, setForm] = useState({
    title: '', client_id: '', client_name: '', type: 'Web Development',
    status: 'active', total_fee: '', start_date: '', end_date: '', description: '', notes: ''
  });

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([ProjectsAPI.list(), ClientsAPI.list()]);
      setProjects(p);
      setClients(c);
      if (p.length > 0 && !selected) setSelected(p[0]);
    } catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  }

  const filtered = projects.filter(p => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || (p.client_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchType = filterType === 'all' || p.type === filterType;
    return matchSearch && matchStatus && matchType;
  });

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const client = clients.find(c => c.id === form.client_id);
      const project = await ProjectsAPI.create({
        ...form,
        client_name: client?.name || form.client_name,
        current_stage: 'Discovery',
        stage_completion: {},
      });
      setProjects(prev => [...prev, project]);
      setSelected(project);
      setShowModal(false);
      setForm({ title: '', client_id: '', client_name: '', type: 'Web Development', status: 'active', total_fee: '', start_date: '', end_date: '', description: '', notes: '' });
      toast.success('Project created');
    } catch { toast.error('Failed to create project'); }
  }

  async function handleStageComplete(project, stage) {
    if (completing) return;
    setCompleting(`${project.id}-${stage}`);
    try {
      const stageCompletion = typeof project.stage_completion === 'object' ? project.stage_completion : {};
      if (stageCompletion[stage]) {
        toast.info('Stage already completed');
        return;
      }

      toast.info('Generating invoice description with AI...');

      // Step 1: AI description
      let description = `Professional ${stage} phase services for ${project.title}`;
      try {
        const aiResult = await AIAPI.generateInvoiceDescription(project.title, project.type, stage, project.client_name);
        description = aiResult.description || description;
      } catch { /* use fallback */ }

      // Step 2: Calculate amount
      const amount = ((parseFloat(project.total_fee) || 0) * STAGE_PERCENTAGES[stage]) / 100;

      // Step 3: Create invoice
      const client = clients.find(c => c.id === project.client_id);
      await InvoicesAPI.create({
        invoice_number: `INV-${Date.now()}`,
        project_id: project.id,
        project_title: project.title,
        client_id: project.client_id,
        client_name: project.client_name,
        client_email: client?.email || '',
        stage,
        stage_description: description,
        amount,
        due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        status: 'draft',
      });

      // Step 4: Update project
      const nextStageIdx = STAGES.indexOf(stage) + 1;
      const nextStage = nextStageIdx < STAGES.length ? STAGES[nextStageIdx] : stage;
      const updatedCompletion = { ...stageCompletion, [stage]: true };
      const updated = await ProjectsAPI.update(project.id, {
        stage_completion: updatedCompletion,
        current_stage: nextStage,
        status: nextStageIdx >= STAGES.length ? 'completed' : project.status,
      });

      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelected(updated);

      // Notification
      await NotificationsAPI.create({
        type: 'invoice_created',
        title: `Invoice created — ${stage} stage`,
        message: `$${amount.toLocaleString()} draft invoice created for ${project.title}. Review in Invoices.`,
      });

      toast.success(`${stage} completed! Invoice created for $${amount.toLocaleString()}`);
    } catch (err) {
      toast.error('Failed to complete stage: ' + err.message);
    } finally {
      setCompleting(null);
    }
  }

  const statusColors = { active: 'badge-success', completed: 'badge-accent', 'on-hold': 'badge-warning', cancelled: 'badge-danger' };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 0px)', overflow: 'hidden' }}>
      {/* Project list */}
      <div style={{ width: 320, borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16 }}>Projects</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
              <Plus size={14} />
            </button>
          </div>
          <div className="search-box" style={{ maxWidth: '100%', marginBottom: 10 }}>
            <Search size={14} />
            <input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['all', ...STATUS_OPTIONS].map(s => (
              <button key={s} className={`filter-btn ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div className="empty-state"><p>No projects found</p></div>
          ) : (
            filtered.map(project => (
              <div
                key={project.id}
                onClick={() => setSelected(project)}
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selected?.id === project.id ? 'var(--accent-dim)' : 'transparent',
                  borderRight: selected?.id === project.id ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{project.client_name}</div>
                  </div>
                  <span className={`badge ${statusColors[project.status] || 'badge-muted'}`}>{project.status}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                    <span>{project.current_stage}</span>
                    <span>{project.type}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: `${Math.round((STAGES.filter(s => (typeof project.stage_completion === 'object' ? project.stage_completion : {})[s]).length / STAGES.length) * 100)}%`
                    }} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Project detail */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        {!selected ? (
          <div className="empty-state" style={{ marginTop: 80 }}>
            <FolderIcon />
            <h3>Select a project</h3>
            <p>Choose a project from the list to view its details and stage pipeline</p>
          </div>
        ) : (
          <ProjectDetail
            project={selected}
            onStageComplete={(stage) => handleStageComplete(selected, stage)}
            completing={completing}
          />
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Project</h2>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Project Title *</label>
                  <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="E.g. Acme Corp Website" />
                </div>
                <div className="form-group">
                  <label>Client *</label>
                  <select value={form.client_id} onChange={e => {
                    const c = clients.find(cl => cl.id === e.target.value);
                    setForm(f => ({ ...f, client_id: e.target.value, client_name: c?.name || '' }));
                  }} required>
                    <option value="">Select client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Project Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Total Fee ($)</label>
                  <input type="number" value={form.total_fee} onChange={e => setForm(f => ({ ...f, total_fee: e.target.value }))} placeholder="10000" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Project overview..." />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderIcon() {
  return <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', marginBottom: 12 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>;
}

function ProjectDetail({ project, onStageComplete, completing }) {
  const stageCompletion = typeof project.stage_completion === 'object' ? project.stage_completion : {};
  const currentStageIdx = STAGES.indexOf(project.current_stage);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>{project.title}</h2>
          <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)', fontSize: 13, flexWrap: 'wrap' }}>
            <span>{project.client_name}</span>
            <span>·</span>
            <span>{project.type}</span>
            {project.total_fee && <><span>·</span><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><DollarSign size={12} />{parseFloat(project.total_fee).toLocaleString()}</span></>}
            {project.end_date && <><span>·</span><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} />{project.end_date}</span></>}
          </div>
        </div>
        <span className={`badge ${project.status === 'active' ? 'badge-success' : project.status === 'completed' ? 'badge-accent' : 'badge-muted'}`}>
          {project.status}
        </span>
      </div>

      {project.description && (
        <div style={{ marginBottom: 24, padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {project.description}
        </div>
      )}

      {/* Stage pipeline */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 20 }}>Stage Pipeline</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STAGES.map((stage, idx) => {
            const isComplete = !!stageCompletion[stage];
            const isCurrent = project.current_stage === stage;
            const isPending = !isComplete && !isCurrent;
            const isCompleting = completing === `${project.id}-${stage}`;
            const fee = parseFloat(project.total_fee) || 0;
            const stageAmount = (fee * STAGE_PERCENTAGES[stage]) / 100;

            return (
              <div key={stage} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: isCurrent ? 'var(--accent-dim)' : isComplete ? 'var(--success-dim)' : 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${isCurrent ? 'var(--accent)' : isComplete ? 'var(--success)' : 'var(--border)'}`,
                opacity: isPending ? 0.6 : 1,
                transition: 'all 0.2s',
              }}>
                {isComplete
                  ? <CheckCircle size={20} color="var(--success)" style={{ flexShrink: 0 }} />
                  : isCurrent
                    ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--accent)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                      </div>
                    : <Circle size={20} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{stage}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {STAGE_PERCENTAGES[stage]}% of total fee
                    {fee > 0 && ` · $${stageAmount.toLocaleString()}`}
                  </div>
                </div>
                {isComplete && <span className="badge badge-success">Done</span>}
                {isCurrent && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => onStageComplete(stage)}
                    disabled={!!completing}
                  >
                    {isCompleting ? 'Processing...' : 'Mark Complete'}
                    {!isCompleting && <ChevronRight size={14} />}
                  </button>
                )}
                {isPending && idx > currentStageIdx && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Upcoming</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
