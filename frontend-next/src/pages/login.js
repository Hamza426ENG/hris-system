import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';
import PublicRoute from '@/components/auth/PublicRoute';
import EdgeLogo from '@/components/common/EdgeLogo';

function LoginContent() {
  const [form, setForm] = useState({ email: '', password: '' });
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
    { label: 'Admin', email: 'admin@company.com', role: 'Super Admin', icon: '👤' },
    { label: 'HR', email: 'hr@company.com', role: 'HR Admin', icon: '👥' },
    { label: 'Manager', email: 'ceo@company.com', role: 'Team Lead', icon: '📊' },
    { label: 'Employee', email: 'jane.smith@company.com', role: 'Employee', icon: '💼' },
  ];

  return (
    <div className="h-screen w-screen bg-white flex relative overflow-hidden">
      {/* Left Side - Logo Section */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-slate-950 via-violet-950 to-purple-950 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-600 rounded-full mix-blend-screen filter blur-3xl opacity-25 animate-blob animation-delay-2000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-fuchsia-500 rounded-full mix-blend-screen filter blur-3xl opacity-15 animate-blob animation-delay-4000"></div>
        </div>
        
        <div className="relative z-10 text-center">
          {/* EDGE Logo */}
          <div className="mb-12 inline-block">
            <EdgeLogo className="w-48 h-auto text-white" />

          </div>
          
          <div>
            <h1 className="text-4xl font-bold text-white mb-3">Welcome to EDGE</h1>
            <p className="text-violet-200 text-lg">HRIS</p>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 bg-white lg:bg-slate-50">
        <div className="w-full max-w-sm">
          {/* Mobile Logo - only shown on mobile */}
          <div className="lg:hidden text-center mb-6">
            <div className="inline-block mb-4">
              <EdgeLogo className="w-24 h-auto text-violet-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Welcome back</h1>
            <p className="text-xs text-slate-600">Sign in to continue</p>
          </div>

          {/* Right Section Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 w-full">
            <div className="hidden lg:block mb-6">
              <h2 className="text-2xl font-bold text-slate-800 mb-1">Sign In</h2>
              <p className="text-sm text-slate-600">Access your account</p>
            </div>

            {error && (
            <div className="flex items-center gap-2 bg-red-50/80 backdrop-blur border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-4 text-xs sm:text-sm shadow-sm flex-shrink-0">
              <AlertCircle size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="line-clamp-2">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4 flex-shrink-0">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative group">
                <Mail size={16} className="sm:w-4.5 sm:h-4.5 absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-violet-600 transition-colors" />
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl px-9 sm:px-12 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-600 focus:ring-2 sm:focus:ring-4 focus:ring-violet-600/10 transition-all shadow-sm"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative group">
                <Lock size={16} className="sm:w-4.5 sm:h-4.5 absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-violet-600 transition-colors" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl px-9 sm:px-12 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-600 focus:ring-2 sm:focus:ring-4 focus:ring-violet-600/10 transition-all shadow-sm"
                  placeholder="••••••••"
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowPw(!showPw)} 
                  className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full gradient-bg text-white font-semibold py-2.5 sm:py-3 rounded-lg sm:rounded-xl transition-all hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 mt-4 sm:mt-5 shadow-md text-sm sm:text-base disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} className="sm:w-4.5 sm:h-4.5" />
                </>
              )}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-5 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-600 mb-2 text-center font-medium">Demo Accounts (pwd: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono text-xs font-semibold">password</code>)</p>
            <div className="grid grid-cols-4 gap-1.5">
              {demoAccounts.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => setForm({ email: acc.email, password: 'password' })}
                  title={`${acc.label} - ${acc.role}`}
                  className="relative overflow-hidden text-center p-2 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 hover:from-violet-50 hover:to-purple-50 border border-slate-200 hover:border-violet-300 transition-all hover:shadow-sm group"
                >
                  <div className="text-lg">{acc.icon}</div>
                  <div className="text-xs font-bold text-slate-800 leading-tight">{acc.label}</div>
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/8 to-purple-500/8 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>
              ))}
            </div>
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
