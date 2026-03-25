import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { adminAPI, employeesAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import Avatar from '@/components/common/Avatar';
import {
  ShieldCheck, ToggleLeft, ToggleRight, UserPlus, Trash2,
  LogOut, Monitor, Users, Activity, X, Eye, EyeOff, Search,
  RefreshCw, ChevronDown, KeyRound
} from 'lucide-react';
import { useConfig } from '@/context/ConfigContext';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtRole = (r) => r ? r.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : r;

// ─── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated, allowedRoles, isSuperAdmin }) {
  const [form, setForm] = useState({ email: '', password: '', role: allowedRoles[0]?.value || 'employee', employee_id: '' });
  const [showPass, setShowPass] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [empSearch, setEmpSearch] = useState('');

  useEffect(() => {
    employeesAPI.list({ limit: 200, status: 'active' })
      .then(r => setEmployees(r.data.data || []))
      .catch(() => {});
  }, []);

  const filteredEmps = employees.filter(e => {
    const q = empSearch.toLowerCase();
    return (
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      (e.employee_id || '').toLowerCase().includes(q)
    );
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        email: form.email,
        password: form.password,
        role: form.role,
      };
      if (form.employee_id) payload.employee_id = form.employee_id;
      await adminAPI.createUser(payload);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-oe-card rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-oe-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center">
              <UserPlus size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-oe-text">Create User Account</h2>
              <p className="text-xs text-oe-muted">Set up login credentials for a team member</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-oe-surface text-oe-muted">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="label">Email Address <span className="text-red-500">*</span></label>
            <input
              type="email"
              className="input"
              placeholder="employee@company.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="label">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="input pr-10"
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-oe-muted hover:text-oe-text"
                onClick={() => setShowPass(s => !s)}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Role <span className="text-red-500">*</span></label>
            <select
              className="input"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            >
              {allowedRoles.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Link to Employee <span className="text-oe-muted text-xs">(optional)</span></label>
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
                <input
                  type="text"
                  className="input pl-8"
                  placeholder="Search employee by name or ID..."
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                />
              </div>
              <select
                className="input"
                value={form.employee_id}
                onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
              >
                <option value="">— No employee link —</option>
                {filteredEmps
                  .filter(e => !e.user_id)
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} ({e.employee_id})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
function ConfirmDeleteModal({ user: targetUser, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-oe-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <Trash2 size={22} className="text-red-500" />
          </div>
          <h3 className="font-semibold text-oe-text">Delete User Account</h3>
          <p className="text-sm text-oe-muted mt-1">
            Are you sure you want to permanently delete <strong>{targetUser.email}</strong>?
            This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change Password Modal ────────────────────────────────────────────────────
function ChangePasswordModal({ user: targetUser, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      await adminAPI.updatePassword(targetUser.id, password);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-oe-card rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-oe-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center">
              <KeyRound size={17} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-oe-text">Reset Password</h2>
              <p className="text-xs text-oe-muted truncate max-w-[200px]">{targetUser.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-oe-surface text-oe-muted">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
          <div>
            <label className="label">New Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="input pr-10"
                placeholder="Min. 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-oe-muted hover:text-oe-text" onClick={() => setShowPass(s => !s)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Confirm Password <span className="text-red-500">*</span></label>
            <input
              type={showPass ? 'text' : 'password'}
              className="input"
              placeholder="Re-enter password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-oe-muted">All active sessions for this user will be revoked immediately.</p>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────
function SessionsTab({ currentUserId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.sessions({ limit: 100 });
      setSessions(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (sessionId) => {
    setRevoking(sessionId);
    try {
      await adminAPI.revokeSession(sessionId);
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, is_active: false } : s));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async (userId, email) => {
    if (!confirm(`Force logout all sessions for ${email}?`)) return;
    setRevoking('user-' + userId);
    try {
      await adminAPI.revokeUserSessions(userId);
      setSessions(prev => prev.map(s => s.user_id === userId ? { ...s, is_active: false } : s));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revoke sessions');
    } finally {
      setRevoking(null);
    }
  };

  const activeSessions = sessions.filter(s => s.is_active);
  const inactiveSessions = sessions.filter(s => !s.is_active);

  if (loading) {
    return (
      <div className="text-center py-16 text-oe-muted">
        <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Loading sessions...
      </div>
    );
  }

  const SessionRow = ({ s }) => {
    const isOwn = s.user_id === currentUserId;
    return (
      <tr className="table-row">
        <td className="table-cell">
          <div className="flex items-center gap-3">
            <Avatar
              src={s.avatar_url}
              firstName={s.first_name || s.email}
              lastName={s.last_name || ''}
              size={30}
            />
            <div>
              <div className="text-sm font-medium text-oe-text">
                {s.first_name && s.last_name ? `${s.first_name} ${s.last_name}` : s.email}
              </div>
              <div className="text-xs text-oe-muted">{s.email}</div>
            </div>
          </div>
        </td>
        <td className="table-cell">
          <span className="badge-pending text-xs">{fmtRole(s.role)}</span>
        </td>
        <td className="table-cell text-xs text-oe-muted max-w-[160px] truncate">
          <div>{s.ip_address || '—'}</div>
          <div className="text-oe-muted/60 truncate" title={s.user_agent}>
            {s.user_agent ? s.user_agent.slice(0, 40) + '…' : '—'}
          </div>
        </td>
        <td className="table-cell text-xs text-oe-muted">{fmtDateTime(s.logged_in_at)}</td>
        <td className="table-cell text-xs text-oe-muted">{fmtDateTime(s.logout_at)}</td>
        <td className="table-cell">
          <span className={s.is_active ? 'badge-active' : 'badge-inactive'}>
            {s.is_active ? 'Active' : 'Ended'}
          </span>
        </td>
        <td className="table-cell">
          {s.is_active && !isOwn && (
            <div className="flex gap-1">
              <button
                onClick={() => handleRevoke(s.id)}
                disabled={revoking === s.id}
                title="Revoke this session"
                className="p-1.5 rounded text-oe-muted hover:text-oe-danger hover:bg-oe-surface transition-colors"
              >
                <LogOut size={15} />
              </button>
              <button
                onClick={() => handleRevokeAll(s.user_id, s.email)}
                disabled={revoking === 'user-' + s.user_id}
                title="Force logout all sessions for this user"
                className="p-1.5 rounded text-oe-muted hover:text-orange-500 hover:bg-oe-surface transition-colors"
              >
                <Monitor size={15} />
              </button>
            </div>
          )}
          {isOwn && <span className="text-xs text-oe-muted">Current</span>}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-oe-muted">
          <span><strong className="text-oe-text">{activeSessions.length}</strong> active sessions</span>
          <span><strong className="text-oe-text">{inactiveSessions.length}</strong> ended sessions</span>
        </div>
        <button onClick={load} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>
                {['User', 'Role', 'Device / IP', 'Logged In', 'Logged Out', 'Status', 'Actions'].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-oe-muted">No sessions found</td>
                </tr>
              ) : (
                <>
                  {activeSessions.map(s => <SessionRow key={s.id} s={s} />)}
                  {inactiveSessions.map(s => <SessionRow key={s.id} s={s} />)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Component ─────────────────────────────────────────────────────
function AdminContent() {
  const { user } = useAuth();
  const { roles } = useConfig();
  const router = useRouter();
  const isSuperAdmin = user?.role === 'super_admin';
  const isHRAdmin = user?.role === 'hr_admin';
  const canAccess = isSuperAdmin || isHRAdmin;

  // Roles the current user can assign/create
  // super_admin → all roles except another super_admin
  // hr_admin    → only company roles below HR level (no hr_admin, hr_manager, super_admin)
  const HR_ALLOWED = ['manager', 'team_lead', 'employee'];
  const SUPER_EXCLUDED = ['super_admin']; // super admin cannot mint another super admin via UI
  const allowedRoles = (
    isSuperAdmin
      ? roles.filter(r => !SUPER_EXCLUDED.includes(r))
      : roles.filter(r => HR_ALLOWED.includes(r))
  ).map(r => ({ value: r, label: fmtRole(r) }));

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [pwTarget, setPwTarget] = useState(null);

  useEffect(() => {
    if (user && !canAccess) router.replace('/');
  }, [user, canAccess, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.users({ search: search || undefined });
      setUsers(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { if (canAccess) load(); }, [load, canAccess]);

  const handleRoleChange = async (userId, newRole) => {
    if (userId === user?.id) return;
    setUpdating(userId + '-role');
    try {
      await adminAPI.updateRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update role');
    } finally {
      setUpdating(null);
    }
  };

  const handleToggle = async (userId) => {
    setUpdating(userId + '-toggle');
    try {
      const res = await adminAPI.toggleUser(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: res.data.is_active } : u));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to toggle user');
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await adminAPI.deleteUser(deleteTarget.id);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  if (!canAccess) return null;

  const activeCount = users.filter(u => u.is_active).length;
  const inactiveCount = users.filter(u => !u.is_active).length;

  const canManageUser = (targetUser) => {
    if (targetUser.id === user?.id) return false; // never manage own account
    if (isSuperAdmin) return targetUser.role !== 'super_admin';
    if (isHRAdmin) return HR_ALLOWED.includes(targetUser.role);
    return false;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-oe-text">Admin Panel</h1>
            <p className="text-sm text-oe-muted">User, Role &amp; Session Management</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus size={16} />
          Create User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', value: users.length, icon: Users, color: 'text-oe-primary' },
          { label: 'Active', value: activeCount, icon: Activity, color: 'text-oe-success' },
          { label: 'Inactive', value: inactiveCount, icon: ToggleLeft, color: 'text-oe-muted' },
          { label: 'Your Role', value: fmtRole(user?.role), icon: ShieldCheck, color: 'text-orange-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={`${color}`}><Icon size={20} /></div>
            <div>
              <div className="text-lg font-bold text-oe-text">{value}</div>
              <div className="text-xs text-oe-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-oe-surface rounded-xl p-1 w-fit">
        {[
          { key: 'users', label: 'Users', icon: Users },
          { key: 'sessions', label: 'Sessions', icon: Monitor },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-white dark:bg-oe-card text-oe-primary shadow-sm'
                : 'text-oe-muted hover:text-oe-text'
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sessions' && <SessionsTab currentUserId={user?.id} />}

      {tab === 'users' && (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Desktop table */}
          <div className="card p-0 overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-oe-surface/50">
                  <tr>
                    {['User', 'Email', 'Role', 'Department', 'Status', 'Last Login', 'Actions'].map(h => (
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-oe-muted">
                        <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Loading...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-oe-muted">No users found</td>
                    </tr>
                  ) : users.map(u => {
                    const isOwnAccount = u.id === user?.id;
                    const isSA = u.role === 'super_admin';
                    const manageable = canManageUser(u);
                    const isRoleUpdating = updating === u.id + '-role';
                    const isToggleUpdating = updating === u.id + '-toggle';
                    const editableRoles = allowedRoles;

                    return (
                      <tr key={u.id} className="table-row">
                        <td className="table-cell">
                          <div className="flex items-center gap-3">
                            <Avatar src={u.avatar_url} firstName={u.first_name || u.email} lastName={u.last_name || ''} size={32} />
                            <div>
                              <div className="font-medium text-oe-text text-sm">
                                {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : '—'}
                              </div>
                              <div className="text-xs text-oe-muted">{u.emp_code || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="table-cell text-sm text-oe-muted">{u.email}</td>
                        <td className="table-cell">
                          {!manageable || isOwnAccount || isSA ? (
                            <div className="space-y-0.5">
                              <span className="badge-pending text-xs">{fmtRole(u.role)}</span>
                              <div className="text-xs text-oe-muted">
                                {isOwnAccount ? 'Own account' : isSA ? 'Protected' : 'No permission'}
                              </div>
                            </div>
                          ) : (
                            <select
                              className="input text-xs py-1 px-2 w-36"
                              value={u.role}
                              disabled={isRoleUpdating}
                              onChange={e => handleRoleChange(u.id, e.target.value)}
                            >
                              {editableRoles.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="table-cell text-xs text-oe-muted">{u.department_name || '—'}</td>
                        <td className="table-cell">
                          <span className={u.is_active ? 'badge-active' : 'badge-inactive'}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="table-cell text-xs text-oe-muted">{fmtDate(u.last_login)}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1">
                            {manageable && !isOwnAccount && (
                              <button
                                onClick={() => setPwTarget(u)}
                                title="Reset password"
                                className="p-1.5 rounded text-oe-muted hover:text-oe-warning hover:bg-oe-surface transition-colors"
                              >
                                <KeyRound size={15} />
                              </button>
                            )}
                            {manageable && !isOwnAccount && (
                              <button
                                onClick={() => handleToggle(u.id)}
                                disabled={isToggleUpdating}
                                title={u.is_active ? 'Deactivate user' : 'Activate user'}
                                className={`p-1.5 rounded transition-colors ${
                                  u.is_active
                                    ? 'text-oe-success hover:text-oe-danger hover:bg-oe-surface'
                                    : 'text-oe-muted hover:text-oe-success hover:bg-oe-surface'
                                }`}
                              >
                                {u.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                              </button>
                            )}
                            {isSuperAdmin && !isOwnAccount && !isSA && (
                              <button
                                onClick={() => setDeleteTarget(u)}
                                title="Delete user"
                                className="p-1.5 rounded text-oe-muted hover:text-red-500 hover:bg-oe-surface transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            {(!manageable || isOwnAccount) && (
                              <span className="text-xs text-oe-muted px-1">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="text-center py-12 text-oe-muted">
                <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-oe-muted">No users found</div>
            ) : users.map(u => {
              const isOwnAccount = u.id === user?.id;
              const isSA = u.role === 'super_admin';
              const manageable = canManageUser(u);
              const isRoleUpdating = updating === u.id + '-role';
              const editableRoles = isSuperAdmin
                ? allowedRoles
                : allowedRoles.filter(r => HR_ALLOWED.includes(r.value));

              return (
                <div key={u.id} className="bg-white dark:bg-oe-card border border-oe-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={u.avatar_url} firstName={u.first_name || u.email} lastName={u.last_name || ''} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-oe-text text-sm">
                        {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : '—'}
                      </div>
                      <div className="text-xs text-oe-muted truncate">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={u.is_active ? 'badge-active' : 'badge-inactive'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {manageable && !isOwnAccount && (
                        <button
                          onClick={() => setPwTarget(u)}
                          title="Reset password"
                          className="p-1.5 rounded text-oe-muted hover:text-oe-warning hover:bg-oe-surface transition-colors"
                        >
                          <KeyRound size={15} />
                        </button>
                      )}
                      {manageable && !isOwnAccount && (
                        <button
                          onClick={() => handleToggle(u.id)}
                          disabled={updating === u.id + '-toggle'}
                          className={`p-1.5 rounded transition-colors ${
                            u.is_active
                              ? 'text-oe-success hover:text-oe-danger hover:bg-oe-surface'
                              : 'text-oe-muted hover:text-oe-success hover:bg-oe-surface'
                          }`}
                        >
                          {u.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        </button>
                      )}
                      {isSuperAdmin && !isOwnAccount && !isSA && (
                        <button
                          onClick={() => setDeleteTarget(u)}
                          className="p-1.5 rounded text-oe-muted hover:text-red-500 hover:bg-oe-surface transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-oe-muted">
                    {u.department_name && <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/10 rounded">{u.department_name}</span>}
                    {u.emp_code && <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/10 rounded">{u.emp_code}</span>}
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/10 rounded">Last login: {fmtDate(u.last_login)}</span>
                  </div>

                  <div>
                    <label className="label">Role</label>
                    {!manageable || isOwnAccount || isSA ? (
                      <div className="space-y-0.5">
                        <span className="badge-pending text-xs">{fmtRole(u.role)}</span>
                        <div className="text-xs text-oe-muted">
                          {isOwnAccount ? 'Own account' : isSA ? 'Protected' : 'No permission'}
                        </div>
                      </div>
                    ) : (
                      <select
                        className="input text-sm"
                        value={u.role}
                        disabled={isRoleUpdating}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                      >
                        {editableRoles.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
          allowedRoles={allowedRoles}
          isSuperAdmin={isSuperAdmin}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
      {pwTarget && (
        <ChangePasswordModal
          user={pwTarget}
          onClose={() => setPwTarget(null)}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <PrivateRoute>
      <Layout>
        <AdminContent />
      </Layout>
    </PrivateRoute>
  );
}
