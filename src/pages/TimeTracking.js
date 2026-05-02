import React, { useState, useEffect, useCallback } from 'react';
import { TimeAPI, ProjectsAPI, ClientsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Trash2, X, Clock, TrendingUp, Calendar, RefreshCw, CheckSquare, Square } from 'lucide-react';
import { format, startOfWeek, isAfter, subDays } from 'date-fns';

function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

const STAGES = ['Discovery', 'Design', 'Development', 'Testing', 'Deployment', 'Training', 'General', 'Meeting'];

export default function TimeTracking() {
  const toast = useToast();
  const [entries, setEntries]       = useState([]);
  const [projects, setProjects]     = useState([]);
  const [clients, setClients]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [showModal, setShowModal]   = useState(false);
  const [showCalSync, setShowCalSync] = useState(false);
  const [form, setForm] = useState({
    project_id: '', project_title: '', stage: 'General',
    description: '', hours: '', billable: 'true',
    date: format(new Date(), 'yyyy-MM-dd'), team_member: '',
  });

  // Calendar sync state
  const [calLoading, setCalLoading]   = useState(false);
  const [calEvents, setCalEvents]     = useState([]);
  const [calError, setCalError]       = useState(null);
  const [calFrom, setCalFrom]         = useState(format(subDays(new Date(), 14), 'yyyy-MM-dd'));
  const [calTo, setCalTo]             = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selected, setSelected]       = useState({}); // eventId → true
  const [mappings, setMappings]       = useState({}); // eventId → { project_id, stage, billable, description }
  const [importing, setImporting]     = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [e, p, c] = await Promise.all([TimeAPI.list(), ProjectsAPI.list(), ClientsAPI.list()]);
      setEntries(e.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setProjects(p);
      setClients(c);
    } catch { toast.error('Failed to load time entries'); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const project = projects.find(p => p.id === form.project_id);
      const entry = await TimeAPI.create({ ...form, project_title: project?.title || form.project_title });
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

  // ── Calendar sync ─────────────────────────────────────
  async function fetchCalendar() {
    setCalLoading(true);
    setCalError(null);
    setCalEvents([]);
    setSelected({});
    setMappings({});
    try {
      const res = await fetch(`/api/calendar/events?from=${calFrom}&to=${calTo + 'T23:59:59'}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch calendar');
      const events = data.events || [];
      setCalEvents(events);
      if (!events.length) {
        toast.info('No timed events found in that range');
      } else {
        // Auto-match immediately after fetch
        const autoMappings = {};
        const autoSelected = {};
        events.forEach(ev => {
          const titleLower = (ev.title + ' ' + ev.description).toLowerCase();
          const matched = projects.find(p => {
            const clientName = (p.client_name || '').toLowerCase();
            const projTitle  = (p.title || '').toLowerCase();
            if (clientName.length > 3 && titleLower.includes(clientName)) return true;
            if (projTitle.length > 3 && titleLower.includes(projTitle)) return true;
            return false;
          }) || projects.find(p => {
            const client = clients.find(c => c.id === p.client_id);
            if (!client?.email) return false;
            const domain = client.email.split('@')[1]?.toLowerCase();
            return domain && ev.attendees.some(a => a.toLowerCase().includes(domain));
          });
          if (matched) {
            autoMappings[ev.id] = { project_id: matched.id, stage: 'Meeting', billable: 'true' };
            autoSelected[ev.id] = true;
          }
        });
        setMappings(autoMappings);
        setSelected(autoSelected);
        const matchCount = Object.keys(autoMappings).length;
        if (matchCount > 0) {
          toast.success(`Fetched ${events.length} events — auto-matched ${matchCount} to projects`);
        } else {
          toast.success(`Fetched ${events.length} events — assign projects below to import`);
        }
      }
    } catch (err) {
      setCalError(err.message);
    }
    setCalLoading(false);
  }

  function toggleSelect(id) {
    setSelected(s => ({ ...s, [id]: !s[id] }));
  }

  function selectAll() {
    const all = {};
    calEvents.forEach(e => { all[e.id] = true; });
    setSelected(all);
  }

  function updateMapping(eventId, key, val) {
    setMappings(m => ({ ...m, [eventId]: { ...(m[eventId] || {}), [key]: val } }));
  }

  // Auto-match events to projects by scanning title/attendees for client names
  function autoMatch() {
    const newMappings = { ...mappings };
    const newSelected = { ...selected };
    let matched = 0;
    calEvents.forEach(ev => {
      if (newMappings[ev.id]?.project_id) return; // already mapped
      const haystack = (ev.title + ' ' + ev.description + ' ' + ev.attendees.join(' ')).toLowerCase();

      const matchedProject = projects.find(p => {
        // Match client name
        const clientName = (p.client_name || '').toLowerCase();
        if (clientName.length > 3 && haystack.includes(clientName)) return true;
        // Match project title keywords
        const projTitle = (p.title || '').toLowerCase();
        if (projTitle.length > 4 && haystack.includes(projTitle)) return true;
        return false;
      }) || projects.find(p => {
        // Match attendee email domain against client email domain
        const client = clients.find(c => c.id === p.client_id);
        if (!client?.email) return false;
        const domain = client.email.split('@')[1]?.toLowerCase();
        const emailUser = client.email.split('@')[0]?.toLowerCase();
        return domain && (
          ev.attendees.some(a => a.toLowerCase().includes(domain)) ||
          ev.attendees.some(a => a.toLowerCase().includes(emailUser))
        );
      });

      if (matchedProject) {
        newMappings[ev.id] = { project_id: matchedProject.id, stage: 'Meeting', billable: 'true' };
        newSelected[ev.id] = true;
        matched++;
      }
    });
    setMappings(newMappings);
    setSelected(newSelected);
    toast.success(matched > 0 ? `Matched ${matched} event${matched !== 1 ? 's' : ''} to projects` : 'No new matches found — assign manually below');
  }

  async function importSelected() {
    const toImport = calEvents.filter(e => selected[e.id]);
    if (!toImport.length) { toast.error('Select at least one event'); return; }
    const unmapped = toImport.filter(e => !mappings[e.id]?.project_id);
    if (unmapped.length) { toast.error(`${unmapped.length} event(s) need a project assigned`); return; }
    setImporting(true);
    let imported = 0;
    for (const ev of toImport) {
      const map = mappings[ev.id];
      const project = projects.find(p => p.id === map.project_id);
      try {
        const entry = await TimeAPI.create({
          project_id: map.project_id,
          project_title: project?.title || '',
          stage: map.stage || 'Meeting',
          description: map.description || ev.title,
          hours: String(ev.hours),
          billable: map.billable ?? 'true',
          date: ev.date,
          team_member: '',
        });
        setEntries(prev => [entry, ...prev]);
        imported++;
      } catch { /* skip failed */ }
    }
    setImporting(false);
    toast.success(`Imported ${imported} calendar event${imported !== 1 ? 's' : ''} as time entries`);
    // Remove imported from list
    setCalEvents(prev => prev.filter(e => !selected[e.id]));
    setSelected({});
  }

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    return (!search || (e.description || '').toLowerCase().includes(q) || (e.project_title || '').toLowerCase().includes(q))
      && (filterProject === 'all' || e.project_id === filterProject);
  });

  const weekStart = startOfWeek(new Date());
  const totalHours    = entries.reduce((s, e) => s + parseFloat(e.hours || 0), 0);
  const billableHours = entries.filter(e => e.billable === 'true').reduce((s, e) => s + parseFloat(e.hours || 0), 0);
  const weekHours     = entries.filter(e => e.date && isAfter(new Date(e.date + 'T12:00:00'), weekStart)).reduce((s, e) => s + parseFloat(e.hours || 0), 0);

  if (loading) return <div className="loading-center" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Time Tracking</h1>
          <p className="page-subtitle">{entries.length} entries · {totalHours.toFixed(1)}h total</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowCalSync(s => !s)}>
            <Calendar size={14} /> {showCalSync ? 'Hide' : 'Sync'} Calendar
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Log Time
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid">
        {[
          { label: 'Total Hours',    val: totalHours.toFixed(1) + 'h',    color: 'var(--text-primary)', icon: <Clock size={14} /> },
          { label: 'Billable Hours', val: billableHours.toFixed(1) + 'h', color: 'var(--success)',      icon: <TrendingUp size={14} /> },
          { label: 'This Week',      val: weekHours.toFixed(1) + 'h',     color: 'var(--info)',         icon: <Calendar size={14} /> },
          { label: 'Billable Rate',  val: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) + '%' : '—', color: 'var(--accent)', icon: <TrendingUp size={14} /> },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{s.icon}{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Calendar Sync Panel ── */}
      {showCalSync && (
        <div className="card" style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>Import from Google Calendar</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Pull timed events and log them as billable time entries against projects</p>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowCalSync(false)}><X size={15} /></button>
          </div>

          {/* Date range + fetch */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
            <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
              <label>From</label>
              <input type="date" value={calFrom} onChange={e => setCalFrom(e.target.value)} style={{ marginBottom: 0 }} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
              <label>To</label>
              <input type="date" value={calTo} onChange={e => setCalTo(e.target.value)} style={{ marginBottom: 0 }} />
            </div>
            <button className="btn btn-primary" onClick={fetchCalendar} disabled={calLoading} style={{ flexShrink: 0 }}>
              <RefreshCw size={13} style={{ animation: calLoading ? 'spin 0.7s linear infinite' : 'none' }} />
              {calLoading ? 'Fetching...' : 'Fetch Events'}
            </button>
          </div>

          {/* Scope warning */}
          {calError && (
            <div style={{ padding: '14px 16px', background: 'var(--danger-dim)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Calendar Access Error</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{calError}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                To fix: go to <strong>OAuth Playground</strong>, add scope <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4 }}>https://www.googleapis.com/auth/calendar.readonly</code> alongside the existing Gmail scope, regenerate your refresh token and update <strong>GMAIL_REFRESH_TOKEN</strong> in Vercel.
              </div>
            </div>
          )}

          {/* Events list */}
          {calEvents.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{calEvents.length}</strong> events found · <strong style={{ color: 'var(--text-primary)' }}>{Object.values(selected).filter(Boolean).length}</strong> selected
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={selectAll}>Select All</button>
                  <button className="btn btn-secondary btn-sm" onClick={autoMatch}>
                    <RefreshCw size={12} /> Auto-Match Projects
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={importSelected} disabled={importing || !Object.values(selected).some(Boolean)}>
                    <CheckSquare size={12} /> {importing ? 'Importing...' : `Import ${Object.values(selected).filter(Boolean).length} Selected`}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
                {calEvents.map(ev => {
                  const map = mappings[ev.id] || {};
                  const isSelected = !!selected[ev.id];
                  const project = projects.find(p => p.id === map.project_id);
                  return (
                    <div key={ev.id} style={{
                      border: `1px solid ${isSelected ? 'var(--accent-border)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                      borderRadius: 10, padding: '14px 16px',
                      transition: 'all 0.15s',
                    }}>
                      {/* Event header row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <button onClick={() => toggleSelect(ev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0, paddingTop: 1 }}>
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{ev.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <span>{fmtDate(ev.date)}</span>
                            <span>{fmtTime(ev.start)} – {fmtTime(ev.end)}</span>
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{ev.hours}h</span>
                            {ev.attendees.length > 0 && <span>{ev.attendees.slice(0, 2).join(', ')}{ev.attendees.length > 2 ? ` +${ev.attendees.length - 2}` : ''}</span>}
                          </div>
                        </div>
                        {project && (
                          <span style={{ fontSize: 11, padding: '3px 9px', background: 'var(--success-dim)', color: 'var(--success)', borderRadius: 99, flexShrink: 0 }}>
                            {project.client_name || project.title}
                          </span>
                        )}
                      </div>

                      {/* Mapping row — only show when selected */}
                      {isSelected && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>Project *</label>
                            <select value={map.project_id || ''} style={{ marginBottom: 0 }}
                              onChange={e => updateMapping(ev.id, 'project_id', e.target.value)}>
                              <option value="">Select project...</option>
                              {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.title} {p.client_name ? `(${p.client_name})` : ''}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>Stage</label>
                            <select value={map.stage || 'Meeting'} style={{ marginBottom: 0 }}
                              onChange={e => updateMapping(ev.id, 'stage', e.target.value)}>
                              {STAGES.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>Billable</label>
                            <select value={map.billable ?? 'true'} style={{ marginBottom: 0 }}
                              onChange={e => updateMapping(ev.id, 'billable', e.target.value)}>
                              <option value="true">Billable</option>
                              <option value="false">Non-billable</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                            <label>Description (optional override)</label>
                            <input value={map.description || ''} style={{ marginBottom: 0 }}
                              placeholder={ev.title}
                              onChange={e => updateMapping(ev.id, 'description', e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!calLoading && !calError && calEvents.length === 0 && (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <Calendar size={32} style={{ opacity: 0.2, marginBottom: 8 }} />
              <p>Fetch your calendar to see events</p>
            </div>
          )}
        </div>
      )}

      {/* ── Search + filter ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          style={{ minWidth: 160, marginBottom: 0 }}>
          <option value="all">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>

      {/* ── Entries table ── */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Stage</th>
                <th>Description</th>
                <th>Hours</th>
                <th>Billable</th>
                <th>Member</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><p>No time entries found</p></div></td></tr>
              ) : filtered.map(entry => (
                <tr key={entry.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(entry.date)}</td>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{entry.project_title || '—'}</td>
                  <td><span className="badge badge-gray" style={{ fontSize: 10 }}>{entry.stage}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.description}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{parseFloat(entry.hours || 0).toFixed(1)}h</td>
                  <td>
                    <span className={`badge ${entry.billable === 'true' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                      {entry.billable === 'true' ? 'Billable' : 'Non-bill'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entry.team_member || '—'}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(entry.id)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Log time modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Log Time</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Project *</label>
                    <select required value={form.project_id} onChange={e => {
                      const p = projects.find(pr => pr.id === e.target.value);
                      setForm(f => ({ ...f, project_id: e.target.value, project_title: p?.title || '' }));
                    }}>
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
                  <label>Description</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you work on?" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Hours *</label>
                    <input required type="number" step="0.25" min="0.25" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="1.5" />
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Billable</label>
                    <select value={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.value }))}>
                      <option value="true">Billable</option>
                      <option value="false">Non-billable</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Team Member</label>
                    <input value={form.team_member} onChange={e => setForm(f => ({ ...f, team_member: e.target.value }))} placeholder="Name" />
                  </div>
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
