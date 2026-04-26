import React from 'react';
import { CheckCircle } from 'lucide-react';

export default function ThankYou() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0fff4 0%, #e8f5e9 100%)',
      padding: 20,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: '#d1fae5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <CheckCircle size={40} color="#059669" />
        </div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 32, fontWeight: 800, color: '#1a1a2e', marginBottom: 12 }}>
          Thank You!
        </h1>
        <p style={{ fontSize: 16, color: '#444', lineHeight: 1.7, marginBottom: 8 }}>
          Your proposal has been accepted. We're excited to work with you!
        </p>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7, marginBottom: 32 }}>
          An invoice has been sent to your email. Our team will be in touch shortly to get started.
        </p>
        <div style={{
          padding: '20px 28px',
          background: 'white',
          borderRadius: 16,
          border: '1px solid #e0f2f1',
          fontSize: 14,
          color: '#555',
          lineHeight: 1.8,
        }}>
          <strong style={{ color: '#1a1a2e' }}>What's next?</strong><br />
          1. Check your email for the invoice<br />
          2. Our team will schedule a kickoff call<br />
          3. Project work begins after initial payment
        </div>
      </div>
    </div>
  );
}
