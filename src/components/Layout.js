import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NotificationsAPI, SettingsAPI } from '../services/sheets';
import {
  LayoutDashboard, FolderOpen, FileText, Receipt,
  Clock, BookOpen, Users, Settings, LogOut,
  ChevronLeft, ChevronRight, Menu
} from 'lucide-react';

const NAV = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/projects', icon: FolderOpen, label: 'Projects' },
  { path: '/proposals', icon: FileText, label: 'Proposals' },
  { path: '/invoices', icon: Receipt, label: 'Invoices' },
  { path: '/time', icon: Clock, label: 'Time' },
  { path: '/books', icon: BookOpen, label: 'Books' },
  { path: '/clients', icon: Users, label: 'Clients' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [companyName, setCompanyName] = useState('Agency Portal');

  useEffect(() => {
    loadNotificationCount();
    loadSettings();
  }, []);

  async function loadNotificationCount() {
    try {
      const notifs = await NotificationsAPI.list();
      setUnreadCount(notifs.filter(n => n.read === 'false').length);
    } catch {}
  }

  async function loadSettings() {
    try {
      const s = await SettingsAPI.getAll();
      if (s.company_name) setCompanyName(s.company_name);
    } catch {}
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const sidebarContent = (
    <div style={{
      width: collapsed ? 64 : 220,
      minHeight: '100vh',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 16px' : '20px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 64,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontFamily: 'var(--font-display)',
          fontWeight: 800, fontSize: 16, color: 'white',
        }}>
          {companyName[0] || 'A'}
        </div>
        {!collapsed && (
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {companyName}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={() => setMobileOpen(false)}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: collapsed ? '10px 16px' : '10px 20px',
              color: isActive ? 'var(--accent-light)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              borderRight: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              position: 'relative',
            })}
          >
            <Icon size={18} style={{ flexShrink: 0 }} />
            {!collapsed && label}
            {label === 'Dashboard' && unreadCount > 0 && !collapsed && (
              <span style={{
                marginLeft: 'auto',
                background: 'var(--danger)',
                color: 'white',
                borderRadius: 10,
                padding: '2px 7px',
                fontSize: 11,
                fontWeight: 700,
              }}>{unreadCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + collapse */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
        {!collapsed && (
          <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--accent-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent-light)', fontSize: 12, fontWeight: 700,
              flexShrink: 0,
            }}>
              {user?.name?.[0] || user?.email?.[0] || 'A'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Admin'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.role || 'admin'}</div>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: collapsed ? '10px 16px' : '10px 20px',
            width: '100%', background: 'none', border: 'none',
            color: 'var(--text-secondary)', cursor: 'pointer',
            fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
          }}
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {!collapsed && 'Sign out'}
        </button>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: collapsed ? '10px 16px' : '10px 20px',
            width: '100%', background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 13, whiteSpace: 'nowrap',
          }}
        >
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /> Collapse</>}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      {sidebarContent}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }}
          onClick={() => setMobileOpen(false)}
        />
      )}
      {mobileOpen && (
        <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 51 }}>
          {sidebarContent}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar (mobile) */}
        <div className="mobile-toggle" style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-secondary)',
        }}>
          <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <Menu size={20} />
          </button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{companyName}</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
