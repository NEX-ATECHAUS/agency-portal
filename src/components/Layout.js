import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NotificationsAPI, SettingsAPI } from '../services/sheets';
import {
  LayoutDashboard, FolderOpen, FileText, Receipt,
  Clock, BookOpen, Users, Settings, LogOut,
  ChevronLeft, ChevronRight, Menu, Sun, Moon, Inbox
} from 'lucide-react';

const NAV = [
  { path: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/projects',  icon: FolderOpen,      label: 'Projects'  },
  { path: '/proposals', icon: FileText,         label: 'Proposals' },
  { path: '/invoices',  icon: Receipt,          label: 'Invoices'  },
  { path: '/time',      icon: Clock,            label: 'Time'      },
  { path: '/books',     icon: BookOpen,         label: 'Books'     },
  { path: '/clients',   icon: Users,            label: 'Clients'   },
  { path: '/enquiries', icon: Inbox,            label: 'Enquiries' },
  { path: '/settings',  icon: Settings,         label: 'Settings'  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed]     = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [companyName, setCompanyName] = useState('NEX-A PORTAL');
  const [theme, setTheme] = useState(() => localStorage.getItem('nex_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nex_theme', theme);
  }, [theme]);

  useEffect(() => {
    loadNotificationCount();
    loadSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  function handleLogout() { logout(); navigate('/login'); }

  const sidebarContent = (
    <div style={{
      width: collapsed ? 60 : 212,
      minHeight: '100vh',
      background: 'rgba(5,8,14,0.95)',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden', flexShrink: 0,
    }}>

      {/* Brand */}
      <div style={{
        padding: collapsed ? '18px 14px' : '18px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 10, minHeight: 60,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'rgba(110,255,160,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6effa0" strokeWidth="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              {companyName}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>Agency Portal</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {!collapsed && (
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.28)', padding: '0 8px', marginBottom: 6, marginTop: 4 }}>
            Menu
          </div>
        )}
        {NAV.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={() => setMobileOpen(false)}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9,
              padding: collapsed ? '8px 14px' : '7px 8px',
              borderRadius: 7,
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.45)',
              background: isActive ? 'rgba(110,255,160,0.10)' : 'transparent',
              textDecoration: 'none',
              fontSize: 12, fontWeight: isActive ? 500 : 400,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              marginBottom: 2,
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 3, height: '60%', background: '#6effa0', borderRadius: '0 3px 3px 0',
                  }} />
                )}
                <Icon size={13} style={{ flexShrink: 0 }} />
                {!collapsed && label}
                {label === 'Dashboard' && unreadCount > 0 && !collapsed && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 600,
                    background: 'rgba(110,255,160,0.2)', color: '#6effa0',
                    padding: '1px 6px', borderRadius: 100,
                  }}>{unreadCount}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + actions */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '8px' }}>
        {/* User row */}
        {!collapsed && (
          <div style={{ padding: '8px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'rgba(110,255,160,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6effa0', fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {user?.name?.[0] || user?.email?.[0] || 'A'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>
                {user?.name || 'Admin'}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap' }}>
                {user?.role || 'admin'}
              </div>
            </div>
          </div>
        )}

        {/* Theme toggle */}
        <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: collapsed ? '8px 14px' : '7px 8px',
          width: '100%', background: 'none', border: 'none', borderRadius: 7,
          color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
          fontSize: 12, whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
          {theme === 'dark' ? <Sun size={13} style={{ flexShrink: 0 }} /> : <Moon size={13} style={{ flexShrink: 0 }} />}
          {!collapsed && (theme === 'dark' ? 'Light mode' : 'Dark mode')}
        </button>

        {/* Sign out */}
        <button onClick={handleLogout} style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: collapsed ? '8px 14px' : '7px 8px',
          width: '100%', background: 'none', border: 'none', borderRadius: 7,
          color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
          fontSize: 12, whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
          <LogOut size={13} style={{ flexShrink: 0 }} />
          {!collapsed && 'Sign out'}
        </button>

        {/* Collapse */}
        <button onClick={() => setCollapsed(c => !c)} style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: collapsed ? '8px 14px' : '7px 8px',
          width: '100%', background: 'none', border: 'none', borderRadius: 7,
          color: 'rgba(255,255,255,0.28)', cursor: 'pointer',
          fontSize: 12, whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
          {collapsed ? <ChevronRight size={13} /> : <><ChevronLeft size={13} /> Collapse</>}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {sidebarContent}

      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }}
          onClick={() => setMobileOpen(false)} />
      )}
      {mobileOpen && (
        <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 51 }}>
          {sidebarContent}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="mobile-toggle" style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-secondary)',
        }}>
          <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <Menu size={20} />
          </button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>{companyName}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
