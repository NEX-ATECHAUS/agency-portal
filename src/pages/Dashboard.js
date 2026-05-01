import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ProjectsAPI, InvoicesAPI, ProposalsAPI, TimeAPI, 
  NotificationsAPI, ClientsAPI 
} from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import {
  DollarSign, FolderOpen, Receipt, Clock,
  Plus, Bell, X, TrendingUp, AlertCircle,
  FileText, Users, ArrowRight
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subMonths, isSameMonth } from 'date-fns';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    projects: [], invoices: [], proposals: [],
    timeEntries: [], notifications: [], clients: []
  });

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true);
    try {
      const [projects, invoices, proposals, timeEntries, notifications, clients] = await Promise.all([
        ProjectsAPI.list(), InvoicesAPI.list(), ProposalsAPI.list(),
        TimeAPI.list(), NotificationsAPI.list(), ClientsAPI.list()
      ]);
      setData({ projects, invoices, proposals, timeEntries, notifications, clients });
    } catch (err) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  async function dismissNotification(id) {
    try {
      await NotificationsAPI.delete(id);
      setData(prev => ({ ...prev, notifications: prev.notifications.filter(n => n.id !== id) }));
    } catch {}
  }

  const revenue = data.invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);
  const activeProjects = data.projects.filter(p => p.status === 'active').length;
  const pendingInvoices = data.invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);
  const totalHours = data.timeEntries.reduce((sum, t) => sum + parseFloat(t.hours || 0), 0);
  const unreadNotifs = data.notifications.filter(n => n.read === 'false');

  const chartData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(new Date(), 5 - i);
    const monthRevenue = data.invoices
      .filter(inv => inv.status === 'paid' && inv.paid_at && isSameMonth(new Date(inv.paid_at), month))
      .reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    return { month: format(month, 'MMM'), revenue: monthRevenue };
  });

  const recentActivity = [
    ...data.invoices.slice(0, 5).map(i => ({
      type: 'invoice', text: `Invoice ${i.invoice_number} — ${i.client_name}`,
      sub: `$${parseFloat(i.amount || 0).toLocaleString()} · ${i.status}`,
      date: i.created_at, color: 'var(--warning)',
    })),
    ...data.proposals.slice(0, 3).map(p => ({
      type: 'proposal', text: `Proposal: ${p.title}`,
      sub: `${p.client_name} · ${p.status}`,
      date: p.created_at, color: 'var(--info)',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  const stages = ['Discovery', 'Design', 'Development', 'Testing', 'Deployment', 'Training'];

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0] || 'Admin'} 👋
          </h1>
          <p className="page-subtitle">Here's what's happening with your agency today.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/proposals')}><FileText size={14} /> New Proposal</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/clients')}><Users size={14} /> New Client</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/invoices')}><Receipt size={14} /> New Invoice</button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/books')}><Plus size={14} /> Add Expense</button>
        </div>
      </div>

      {unreadNotifs.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)', background: 'var(--accent-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Bell size={16} color="var(--accent-light)" />
            <span style={{ fontWeight: 600, color: 'var(--accent-light)' }}>{unreadNotifs.length} notification{unreadNotifs.length > 1 ? 's' : ''}</span>
          </div>
          {unreadNotifs.map(n => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid rgba(108,99,255,0.2)' }}>
              <AlertCircle size={15} color="var(--accent-light)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{n.message}</div>
              </div>
              <button onClick={() => dismissNotification(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard label="Total Revenue"     value={`$${revenue.toLocaleString()}`}         icon={<DollarSign size={18} color="var(--success)" />}      iconBg="var(--success-dim)"  change="Paid invoices" />
        <StatCard label="Active Projects"   value={activeProjects}                          icon={<FolderOpen size={18} color="var(--accent-light)" />}  iconBg="var(--accent-dim)"   change={`${data.projects.length} total`} />
        <StatCard label="Pending Invoices"  value={`$${pendingInvoices.toLocaleString()}`}  icon={<Receipt size={18} color="var(--warning)" />}          iconBg="var(--warning-dim)"  change="Awaiting payment" />
        <StatCard label="Total Hours"       value={totalHours.toFixed(1)}                   icon={<Clock size={18} color="var(--info)" />}               iconBg="var(--info-dim)"     change="All time tracked" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15 }}>Revenue (6 months)</h3>
            <TrendingUp size={16} color="var(--text-muted)" />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
              <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={v => [`$${v.toLocaleString()}`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Recent Activity</h3>
          {recentActivity.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}><p>No recent activity</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentActivity.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15 }}>Active Projects</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')}>View all <ArrowRight size={14} /></button>
        </div>
        {data.projects.filter(p => p.status === 'active').length === 0 ? (
          <div className="empty-state"><p>No active projects</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.projects.filter(p => p.status === 'active').slice(0, 5).map(project => {
              const completion = project.stage_completion || {};
              const completedStages = stages.filter(s => completion[s]).length;
              const pct = Math.round((completedStages / stages.length) * 100);
              return (
                <div key={project.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/projects')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{project.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>{project.client_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{project.current_stage}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)' }}>{pct}%</span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--accent)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, iconBg, change }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: iconBg }}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-change">{change}</div>
    </div>
  );
}
