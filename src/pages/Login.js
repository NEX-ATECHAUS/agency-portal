import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Invalid credentials');
      }
      const data = await res.json();
      login(data.user);
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#08080f',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Left panel — branding */}
      <div style={{
        flex: '0 0 45%',
        background: 'linear-gradient(145deg, #1a1730 0%, #0d0b1a 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 52px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(108,99,255,0.15) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-10%', left: '-10%',
          width: 480, height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(108,99,255,0.2) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44,
              background: 'linear-gradient(135deg, #6c63ff, #9b94ff)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800,
              fontFamily: 'var(--font-display)',
              color: 'white',
              boxShadow: '0 4px 20px rgba(108,99,255,0.5)',
            }}>A</div>
            <span style={{
              fontSize: 18, fontWeight: 700,
              fontFamily: 'var(--font-display)',
              color: 'white', letterSpacing: '-0.3px',
            }}>Agency Portal</span>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{
            fontSize: 38, fontWeight: 800,
            fontFamily: 'var(--font-display)',
            color: 'white',
            lineHeight: 1.15,
            letterSpacing: '-1px',
            marginBottom: 16,
          }}>
            Run your agency<br />
            <span style={{ color: '#8b85ff' }}>from one place.</span>
          </h2>
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.7, maxWidth: 320,
          }}>
            Proposals, projects, invoices, and client management — all connected and automated.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 28 }}>
            {['Proposals', 'Invoicing', 'Time Tracking', 'Client Portal', 'AI Descriptions'].map(f => (
              <span key={f} style={{
                padding: '6px 12px',
                background: 'rgba(108,99,255,0.12)',
                border: '1px solid rgba(108,99,255,0.2)',
                borderRadius: 20,
                fontSize: 12, color: 'rgba(255,255,255,0.6)',
                fontWeight: 500,
              }}>{f}</span>
            ))}
          </div>
        </div>

        <p style={{ position: 'relative', zIndex: 1, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          Admin access only
        </p>
      </div>

      {/* Right panel — form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
        background: '#0a0a0f',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 40 }}>
            <h1 style={{
              fontSize: 26, fontWeight: 700,
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
              marginBottom: 8, letterSpacing: '-0.5px',
            }}>Welcome back</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Sign in to your admin account
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 500,
                color: 'var(--text-secondary)', marginBottom: 8,
              }}>Email address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{
                  position: 'absolute', left: 14, top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none',
                }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@agency.com"
                  required
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 14px 12px 40px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    color: 'var(--text-primary)',
                    fontSize: 14, outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(108,99,255,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
              </div>
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 500,
                color: 'var(--text-secondary)', marginBottom: 8,
              }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{
                  position: 'absolute', left: 14, top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none',
                }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 40px 12px 40px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    color: 'var(--text-primary)',
                    fontSize: 14, outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(108,99,255,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  style={{
                    position: 'absolute', right: 14, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)',
                    padding: 0, display: 'flex',
                  }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                width: '100%',
                padding: '13px',
                background: loading ? 'rgba(108,99,255,0.5)' : 'linear-gradient(135deg, #6c63ff, #5a52d5)',
                border: 'none',
                borderRadius: 10,
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: loading ? 'none' : '0 4px 20px rgba(108,99,255,0.35)',
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 16, height: 16,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  Signing in...
                </>
              ) : (
                <>Sign in <ArrowRight size={15} /></>
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.2) !important; }
      `}</style>
    </div>
  );
}
