import React, { useState, useEffect } from 'react';
import { ProjectsAPI, ClientsAPI, InvoicesAPI, NotificationsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, CheckCircle, Circle, ChevronRight, X, DollarSign, Calendar, Trash2 } from 'lucide-react';
import { format, addDays } from 'date-fns';

const DEFAULT_STAGES = [
  { name: 'Discovery',   pct: 15 },
  { name: 'Design',      pct: 20 },
  { name: 'Development', pct: 30 },
  { name: 'Testing',     pct: 15 },
  { name: 'Deployment',  pct: 15 },
  { name: 'Training',    pct: 5  },
];

const STATUS_OPTIONS = ['active', 'completed', 'on-hold', 'cancelled'];
const TYPE_OPTIONS   = ['Web Development', 'Mobile App', 'Design', 'Branding', 'SEO', 'Consulting', 'Other'];

function parseCompletion(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (typeof p === 'object') return p; } catch {}
  }
  return {};
}

function parseStages(raw) {
  if (!raw || raw === '' || raw === '[]') return null; // null = no custom stages set
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return null;
}

function stageNames(stages) { return stages.map(s => s.name); }

function totalPct(stages) { return stages.reduce((s, st) => s + Number(st.pct || 0), 0); }

export default function Projects() {
  const toast = useToast();
  const [projects, setProjects]       = useState([]);
  const [clients, setClients]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal]     = useState(false);
  const [completing, setCompleting]   = useState(null);

  const emptyForm = () => ({
    title: '', client_id: '', client_name: '', type: 'Web Development',
    status: 'active', total_fee: '', start_date: '', end_date: '', description: '',
    payment_stages: DEFAULT_STAGES.map(s => ({ ...s })),
  });
  const [form, setForm] = useState(emptyForm());

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
    const q = search.toLowerCase();
    const matchSearch = !search || p.title?.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Stage schedule helpers ──────────────────────────────
  function addStage() {
    setForm(f => ({ ...f, payment_stages: [...f.payment_stages, { name: '', pct: 0 }] }));
  }
  function removeStage(idx) {
    setForm(f => ({ ...f, payment_stages: f.payment_stages.filter((_, i) => i !== idx) }));
  }
  function updateStage(idx, key, val) {
    setForm(f => {
      const s = [...f.payment_stages];
      s[idx] = { ...s[idx], [key]: key === 'pct' ? val : val };
      return { ...f, payment_stages: s };
    });
  }

  // ── Create project ──────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    const pct = totalPct(form.payment_stages);
    if (pct !== 100) { toast.error(`Stage percentages must add up to 100% (currently ${pct}%)`); return; }
    const stages = form.payment_stages.filter(s => s.name.trim());
    if (stages.length === 0) { toast.error('Add at least one stage'); return; }
    try {
      const client = clients.find(c => c.id === form.client_id);
      const project = await ProjectsAPI.create({
        ...form,
        client_name: client?.name || form.client_name,
        current_stage: stages[0].name,
        stage_completion: {},
        payment_stages: JSON.stringify(stages),
      });
      setProjects(prev => [...prev, project]);
      setSelected(project);
      setShowModal(false);
      setForm(emptyForm());
      toast.success('Project created');
    } catch { toast.error('Failed to create project'); }
  }

  // ── Complete stage → create invoice ────────────────────
  async function handleStageComplete(project, stage) {
    if (completing) return;
    setCompleting(`${project.id}-${stage}`);
    try {
      const stages   = parseStages(project.payment_stages) || DEFAULT_STAGES;
      const stageObj = stages.find(s => s.name === stage);
      const stageCompletion = parseCompletion(project.stage_completion);

      if (stageCompletion[stage]) { toast.info('Stage already completed'); return; }

      const fee    = parseFloat(project.total_fee) || 0;
      const pct    = Number(stageObj?.pct || 0);
      const amount = (fee * pct) / 100;

      const client = clients.find(c => c.id === project.client_id);
      const allNames = stageNames(stages);
      const nextIdx  = allNames.indexOf(stage) + 1;
      const nextStage = nextIdx < allNames.length ? allNames[nextIdx] : stage;

      // Create invoice
      await InvoicesAPI.create({
        project_id: project.id,
        project_title: project.title,
        client_id: project.client_id,
        client_name: project.client_name,
        client_email: client?.email || '',
        stage,
        stage_description: `${stage} phase — ${project.title}`,
        amount,
        due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        status: 'draft',
      });

      const updatedCompletion = { ...stageCompletion, [stage]: true };
      const updated = await ProjectsAPI.update(project.id, {
        stage_completion: updatedCompletion,
        current_stage: nextStage,
        status: nextIdx >= allNames.length ? 'completed' : project.status,
      });

      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelected(updated);

      await NotificationsAPI.create({
        type: 'invoice_created',
        title: `Invoice created — ${stage}`,
        message: `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })} draft invoice created for ${project.title}.`,
      });

      toast.success(`${stage} complete! Draft invoice for $${amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })} created.`);
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally { setCompleting(null); }
  }

  const statusColors = {
    active: 'badge-green', completed: 'badge-purple',
    'on-hold': 'badge-yellow', cancelled: 'badge-red',
  };

  if (loading) return <div className="loading-center" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      {/* ── List panel ───────────────────────────── */}
      <div style={{ width: 300, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Projects</h2>
            <button className="btn btn-primary btn-sm" onClick={() => { setForm(emptyForm()); setShowModal(true); }}>
              <Plus size={13} /> New
            </button>
          </div>
          <div className="search-bar" style={{ marginBottom: 10 }}>
            <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {['all', ...STATUS_OPTIONS].map(s => (
              <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-secondary'}`}
                style={{ textTransform: 'capitalize', padding: '4px 10px', fontSize: 11 }}
                onClick={() => setFilterStatus(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div className="empty-state"><p>No projects</p></div>
          ) : filtered.map(project => {
            const stages = parseStages(project.payment_stages) || DEFAULT_STAGES;
            const completion = parseCompletion(project.stage_completion);
            const done = stageNames(stages).filter(s => completion[s]).length;
            const pct  = stages.length ? Math.round((done / stages.length) * 100) : 0;
            return (
              <div key={project.id} onClick={() => setSelected(project)} style={{
                padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: selected?.id === project.id ? 'var(--accent-dim)' : 'transparent',
                borderRight: selected?.id === project.id ? '3px solid var(--accent)' : '3px solid transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{project.client_name}</div>
                  </div>
                  <span className={`badge ${statusColors[project.status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{project.status}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>
                    <span>{project.current_stage}</span>
                    <span>{pct}%</span>
                  </div>
                  <div style={{ height: 3, background: 'var(--border)', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 36px' }}>
        {!selected ? (
          <div className="empty-state" style={{ marginTop: 80 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', marginBottom: 12 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            <h3>Select a project</h3>
            <p>Choose a project from the list to view its details and payment schedule</p>
          </div>
        ) : (
          <ProjectDetail
            project={selected}
            onStageComplete={stage => handleStageComplete(selected, stage)}
            completing={completing}
          />
        )}
      </div>

      {/* ── Create modal ─────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Project</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Project Title *</label>
                    <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Acme Corp Website" />
                  </div>
                  <div className="form-group">
                    <label>Client *</label>
                    <select required value={form.client_id} onChange={e => {
                      const c = clients.find(cl => cl.id === e.target.value);
                      setForm(f => ({ ...f, client_id: e.target.value, client_name: c?.name || '' }));
                    }}>
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
                    <label>Total Fee (AUD)</label>
                    <input type="number" step="0.01" value={form.total_fee} onChange={e => setForm(f => ({ ...f, total_fee: e.target.value }))} placeholder="10000.00" />
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
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Project overview..." />
                </div>

                {/* Payment schedule */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Payment Schedule</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Define stages and invoice percentages. Must total 100%.</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: totalPct(form.payment_stages) === 100 ? 'var(--success)' : 'var(--danger)',
                      }}>{totalPct(form.payment_stages)}%</span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={addStage}>
                        <Plus size={12} /> Add Stage
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Header row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 36px', gap: 8, padding: '0 0 4px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Stage Name</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', textAlign: 'center' }}>%</span>
                      <span />
                    </div>
                    {form.payment_stages.map((stage, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 36px', gap: 8, alignItems: 'center' }}>
                        <input
                          value={stage.name}
                          onChange={e => updateStage(idx, 'name', e.target.value)}
                          placeholder={`Stage ${idx + 1}`}
                          style={{ marginBottom: 0 }}
                        />
                        <input
                          type="number" min="0" max="100" step="1"
                          value={stage.pct}
                          onChange={e => updateStage(idx, 'pct', Number(e.target.value))}
                          style={{ marginBottom: 0, textAlign: 'center' }}
                        />
                        <button type="button" className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => removeStage(idx)}
                          style={{ color: 'var(--danger)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Fee preview */}
                  {form.total_fee && parseFloat(form.total_fee) > 0 && (
                    <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 10 }}>Invoice amounts preview</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {form.payment_stages.filter(s => s.name).map((s, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{s.name}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                              ${((parseFloat(form.total_fee) * Number(s.pct)) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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

function ProjectDetail({ project, onStageComplete, completing }) {
  const stages = parseStages(project.payment_stages) || DEFAULT_STAGES;
  const stageCompletion = parseCompletion(project.stage_completion);
  const currentStageIdx = stageNames(stages).indexOf(project.current_stage);
  const fee = parseFloat(project.total_fee) || 0;

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: '-0.5px', marginBottom: 6 }}>{project.title}</h2>
          <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)', fontSize: 13, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{project.client_name}</span>
            <span style={{ color: 'var(--border)' }}>·</span>
            <span>{project.type}</span>
            {fee > 0 && <>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <DollarSign size={12} />
                {fee.toLocaleString('en-AU', { minimumFractionDigits: 2 })} total
              </span>
            </>}
            {project.end_date && <>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Calendar size={12} />{project.end_date}
              </span>
            </>}
          </div>
        </div>
        <span className={`badge ${project.status === 'active' ? 'badge-green' : project.status === 'completed' ? 'badge-purple' : 'badge-gray'}`}>
          {project.status}
        </span>
      </div>

      {project.description && (
        <div style={{ marginBottom: 28, padding: '16px 20px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {project.description}
        </div>
      )}

      {/* Stage pipeline */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15 }}>Payment Schedule</h3>
          {fee > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Total: ${fee.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stages.map((stageObj, idx) => {
            const stage = stageObj.name;
            const pct   = Number(stageObj.pct || 0);
            const isComplete  = !!stageCompletion[stage];
            const isCurrent   = project.current_stage === stage;
            const isPending   = !isComplete && !isCurrent;
            const isCompleting = completing === `${project.id}-${stage}`;
            const stageAmount = fee > 0 ? (fee * pct) / 100 : 0;

            return (
              <div key={stage} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 18px',
                background: isCurrent ? 'var(--accent-dim)' : isComplete ? 'var(--success-dim)' : 'var(--bg-elevated)',
                borderRadius: 'var(--radius)',
                border: `1px solid ${isCurrent ? 'rgba(108,99,255,0.3)' : isComplete ? 'rgba(52,213,114,0.25)' : 'var(--border)'}`,
                opacity: isPending ? 0.55 : 1,
              }}>
                {isComplete
                  ? <CheckCircle size={18} color="var(--success)" style={{ flexShrink: 0 }} />
                  : isCurrent
                    ? <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--accent)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
                      </div>
                    : <Circle size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{stage}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {pct}% of project fee
                    {fee > 0 && <span style={{ fontWeight: 600, color: 'var(--text-secondary)', marginLeft: 6 }}>
                      → ${stageAmount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                    </span>}
                  </div>
                </div>
                {isComplete && <span className="badge badge-green">Invoiced</span>}
                {isCurrent && (
                  <button className="btn btn-primary btn-sm" onClick={() => onStageComplete(stage)} disabled={!!completing}>
                    {isCompleting ? 'Creating...' : 'Mark Complete'} {!isCompleting && <ChevronRight size={13} />}
                  </button>
                )}
                {isPending && idx > currentStageIdx && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Upcoming</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
