import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Proposals from './pages/Proposals';
import Invoices from './pages/Invoices';

import TimeTracking from './pages/TimeTracking';
import Books from './pages/Books';
import Clients from './pages/Clients';
import Enquiries from './pages/Enquiries';
import Settings from './pages/Settings';
import ProposalView from './pages/ProposalView';
import ThankYou from './pages/ThankYou';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="loading-center" style={{ height: '100vh' }}>
      <div className="spinner" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/proposal/:id" element={<ProposalView />} />
      <Route path="/thank-you" element={<ThankYou />} />

      {/* Protected admin routes */}
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="proposals" element={<Proposals />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="time" element={<TimeTracking />} />
        <Route path="books" element={<Books />} />
        <Route path="clients" element={<Clients />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
