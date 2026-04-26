import React, { useState, useEffect } from 'react';
import { SettingsAPI } from '../services/sheets';
import { useToast } from '../contexts/ToastContext';
import { Save, Building, CreditCard, FileText } from 'lucide-react';

const DEFAULTS = {
  company_name: '', logo_url: '', primary_color: '#6c63ff',
  email: '', phone: '', address: '', website: '',
  bank_name: '', bank_bsb: '', bank_account: '', bank_account_name: '',
  paypal: '', stripe_link: '',
  invoice_footer: 'Thank you for your business.', payment_terms: 'Payment due within 30 days.',
  dark_mode: 'true',
};

const TABS = [
  { id: 'company', label: 'Company', icon: Building },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'invoice', label: 'Invoices', icon: FileText },
];

export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('company');

  useEffect(() => { loadSettings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSettings() {
    setLoading(true);
    try {
      const s = await SettingsAPI.getAll();
      setSettings({ ...DEFAULTS, ...s });
    } catch { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await SettingsAPI.setAll(settings);
      toast.success('Settings saved');
    } catch { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  }

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="page" style={{ maxWidth: 800 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your agency portal</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 16px', background: 'none', border: 'none',
            borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === id ? 'var(--accent-light)' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 13, fontWeight: 500, marginBottom: -1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave}>
        {tab === 'company' && (
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 20 }}>Company Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Company Name</label>
                <input value={settings.company_name} onChange={e => set('company_name', e.target.value)} placeholder="My Agency" />
              </div>
              <div className="form-group">
                <label>Logo URL</label>
                <input value={settings.logo_url} onChange={e => set('logo_url', e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={settings.email} onChange={e => set('email', e.target.value)} placeholder="hello@agency.com" />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={settings.phone} onChange={e => set('phone', e.target.value)} placeholder="+61 400 000 000" />
              </div>
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={settings.address} onChange={e => set('address', e.target.value)} placeholder="123 Main Street, Melbourne VIC 3000" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Website</label>
                <input value={settings.website} onChange={e => set('website', e.target.value)} placeholder="https://myagency.com" />
              </div>
              <div className="form-group">
                <label>Brand Color</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 50, height: 40, padding: 4, cursor: 'pointer' }} />
                  <input value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ flex: 1 }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'payment' && (
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 20 }}>Bank & Payment Details</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>These details will appear on your invoices.</p>
            <div className="form-row">
              <div className="form-group">
                <label>Bank Name</label>
                <input value={settings.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="Commonwealth Bank" />
              </div>
              <div className="form-group">
                <label>Account Name</label>
                <input value={settings.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} placeholder="My Agency Pty Ltd" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>BSB</label>
                <input value={settings.bank_bsb} onChange={e => set('bank_bsb', e.target.value)} placeholder="062-000" />
              </div>
              <div className="form-group">
                <label>Account Number</label>
                <input value={settings.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder="12345678" />
              </div>
            </div>
            <div className="divider" />
            <h4 style={{ fontSize: 14, marginBottom: 16 }}>Online Payment Links</h4>
            <div className="form-row">
              <div className="form-group">
                <label>PayPal Email / Link</label>
                <input value={settings.paypal} onChange={e => set('paypal', e.target.value)} placeholder="paypal.me/myagency" />
              </div>
              <div className="form-group">
                <label>Stripe Payment Link</label>
                <input value={settings.stripe_link} onChange={e => set('stripe_link', e.target.value)} placeholder="https://buy.stripe.com/..." />
              </div>
            </div>
          </div>
        )}

        {tab === 'invoice' && (
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 20 }}>Invoice Settings</h3>
            <div className="form-group">
              <label>Invoice Footer Text</label>
              <textarea rows={3} value={settings.invoice_footer} onChange={e => set('invoice_footer', e.target.value)} placeholder="Thank you for your business..." />
            </div>
            <div className="form-group">
              <label>Default Payment Terms</label>
              <textarea rows={2} value={settings.payment_terms} onChange={e => set('payment_terms', e.target.value)} placeholder="Payment due within 30 days..." />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
