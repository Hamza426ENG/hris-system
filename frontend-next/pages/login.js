import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Building2, Lock, Mail, AlertCircle } from 'lucide-react';
import PublicRoute from '../components/PublicRoute';

function LoginContent() {
  const [form, setForm] = useState({ email: 'admin@company.com', password: 'password' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(form.email, form.password);
      router.push('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    { label: 'Admin', email: 'admin@company.com', role: 'Super Admin' },
    { label: 'HR', email: 'hr@company.com', role: 'HR Admin' },
    { label: 'Team Lead', email: 'ceo@company.com', role: 'Team Lead' },
    { label: 'Employee', email: 'jane.smith@company.com', role: 'Employee' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 bg-grid">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 gradient-bg rounded-2xl mb-4 shadow-lg">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-oe-text">OnEdge HRIS</h1>
          <p className="text-oe-muted text-sm mt-1">Human Resource Information System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-oe-border shadow-lg p-6">
          <h2 className="text-lg font-semibold text-oe-text mb-1">Welcome back</h2>
          <p className="text-oe-muted text-sm mb-6">Sign in to your account to continue</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 mb-4 text-sm">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="input pl-9"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="input pl-9 pr-10"
                  placeholder="••••••••"
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-oe-muted hover:text-oe-text">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full gradient-bg text-white font-semibold py-2.5 rounded-lg transition-opacity hover:opacity-90 flex items-center justify-center gap-2 mt-2 shadow-md">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6 pt-5 border-t border-oe-border">
            <p className="text-xs text-oe-muted mb-3 text-center">Demo accounts (password: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-oe-text font-mono">password</code>)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {demoAccounts.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => setForm({ email: acc.email, password: 'password' })}
                  className="text-center py-2 px-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-oe-border transition-colors"
                >
                  <div className="text-xs font-semibold text-oe-text">{acc.label}</div>
                  <div className="text-xs text-oe-muted">{acc.role}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PublicRoute>
      <LoginContent />
    </PublicRoute>
  );
}
