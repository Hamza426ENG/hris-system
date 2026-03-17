import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import { ShieldCheck, ToggleLeft, ToggleRight } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'hr_admin', label: 'HR Admin' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'employee', label: 'Employee' },
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    if (user?.role !== 'super_admin') {
      navigate('/');
    }
  }, [user, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.users();
      setUsers(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  if (user?.role !== 'super_admin') return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center">
          <ShieldCheck size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-oe-text">Admin Panel</h1>
          <p className="text-sm text-oe-muted">User &amp; Role Management</p>
        </div>
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
                const isRoleUpdating = updating === u.id + '-role';
                const isToggleUpdating = updating === u.id + '-toggle';

                return (
                  <tr key={u.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={u.avatar_url}
                          firstName={u.first_name || u.email}
                          lastName={u.last_name || ''}
                          size={32}
                        />
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
                      {isOwnAccount ? (
                        <div className="space-y-1">
                          <span className="badge-pending text-xs">
                            {ROLE_OPTIONS.find(r => r.value === u.role)?.label || u.role}
                          </span>
                          <div className="text-xs text-oe-muted">Cannot change own role</div>
                        </div>
                      ) : (
                        <select
                          className="input text-xs py-1 px-2 w-36"
                          value={u.role}
                          disabled={isRoleUpdating}
                          onChange={e => handleRoleChange(u.id, e.target.value)}
                        >
                          {ROLE_OPTIONS.map(r => (
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
                      <button
                        onClick={() => handleToggle(u.id)}
                        disabled={isToggleUpdating}
                        className={`p-1.5 rounded hover:bg-oe-surface transition-colors ${u.is_active ? 'text-oe-success hover:text-oe-danger' : 'text-oe-muted hover:text-oe-success'}`}
                        title={u.is_active ? 'Deactivate user' : 'Activate user'}
                      >
                        {u.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
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
          const isRoleUpdating = updating === u.id + '-role';
          const isToggleUpdating = updating === u.id + '-toggle';

          return (
            <div key={u.id} className="bg-white border border-oe-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar
                  src={u.avatar_url}
                  firstName={u.first_name || u.email}
                  lastName={u.last_name || ''}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-oe-text text-sm">
                    {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : '—'}
                  </div>
                  <div className="text-xs text-oe-muted truncate">{u.email}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={u.is_active ? 'badge-active' : 'badge-inactive'}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => handleToggle(u.id)}
                    disabled={isToggleUpdating}
                    className={`p-1.5 rounded hover:bg-oe-surface transition-colors ${u.is_active ? 'text-oe-success hover:text-oe-danger' : 'text-oe-muted hover:text-oe-success'}`}
                    title={u.is_active ? 'Deactivate user' : 'Activate user'}
                  >
                    {u.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-oe-muted">
                {u.department_name && <span className="px-2 py-0.5 bg-slate-100 rounded">{u.department_name}</span>}
                {u.emp_code && <span className="px-2 py-0.5 bg-slate-100 rounded">{u.emp_code}</span>}
                <span className="px-2 py-0.5 bg-slate-100 rounded">Last login: {fmtDate(u.last_login)}</span>
              </div>

              <div>
                <label className="label">Role</label>
                {isOwnAccount ? (
                  <div className="space-y-1">
                    <span className="badge-pending text-xs">
                      {ROLE_OPTIONS.find(r => r.value === u.role)?.label || u.role}
                    </span>
                    <div className="text-xs text-oe-muted">Cannot change own role</div>
                  </div>
                ) : (
                  <select
                    className="input text-sm"
                    value={u.role}
                    disabled={isRoleUpdating}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
