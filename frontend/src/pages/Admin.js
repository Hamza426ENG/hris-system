import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, employeesAPI, widgetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { ShieldCheck, ToggleLeft, ToggleRight, UserPlus, Eye, EyeOff, LayoutDashboard, Save } from 'lucide-react';

const ADMIN_TABS = [
  { id: 'users', label: 'Users & Roles', icon: ShieldCheck },
  { id: 'widgets', label: 'Dashboard Widgets', icon: LayoutDashboard },
];

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'hr_admin', label: 'HR Admin' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'employee', label: 'Employee' },
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

const EMPTY_FORM = { email: '', password: '', confirm_password: '', role: 'employee', employee_id: '' };

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [employees, setEmployees] = useState([]);
  // Widget settings state
  const [widgetDefs, setWidgetDefs] = useState([]);
  const [widgetMatrix, setWidgetMatrix] = useState({});
  const [widgetRoles, setWidgetRoles] = useState([]);
  const [widgetSaving, setWidgetSaving] = useState(false);

  useEffect(() => {
    if (!['super_admin', 'hr_admin'].includes(user?.role)) navigate('/');
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

  // Load widget settings
  const loadWidgets = useCallback(async () => {
    try {
      const res = await widgetsAPI.get();
      setWidgetDefs(res.data.definitions || []);
      setWidgetMatrix(res.data.matrix || {});
      setWidgetRoles(res.data.roles || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { if (activeTab === 'widgets') loadWidgets(); }, [activeTab, loadWidgets]);

  const handleWidgetToggle = (widgetKey, role) => {
    setWidgetMatrix(prev => ({
      ...prev,
      [widgetKey]: { ...prev[widgetKey], [role]: !prev[widgetKey]?.[role] },
    }));
  };

  const saveWidgets = async () => {
    setWidgetSaving(true);
    try {
      const changes = [];
      for (const [widgetKey, roles] of Object.entries(widgetMatrix)) {
        for (const [role, visible] of Object.entries(roles)) {
          changes.push({ widget_key: widgetKey, role, is_visible: visible });
        }
      }
      await widgetsAPI.update(changes);
    } catch (err) { alert('Failed to save: ' + (err.response?.data?.error || err.message)); }
    finally { setWidgetSaving(false); }
  };

  const openCreateModal = async (currentUsers) => {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowPw(false);
    setShowModal(true);
    try {
      const res = await employeesAPI.list({ status: 'active', limit: 500 });
      const allEmps = res.data.data || [];
      const linkedIds = new Set(currentUsers.filter(u => u.employee_id).map(u => u.employee_id));
      setEmployees(allEmps.filter(e => !linkedIds.has(e.id)));
    } catch { setEmployees([]); }
  };

  const handleCreate = async () => {
    setFormError('');
    if (!form.email || !form.password || !form.role) { setFormError('Email, password, and role are required.'); return; }
    if (form.password.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
    if (form.password !== form.confirm_password) { setFormError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      await adminAPI.createUser({ email: form.email, password: form.password, role: form.role, employee_id: form.employee_id || null });
      setShowModal(false);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create user.');
    } finally { setSaving(false); }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (userId === user?.id) return;
    setUpdating(userId + '-role');
    try {
      await adminAPI.updateRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) { alert(err.response?.data?.error || 'Failed to update role'); }
    finally { setUpdating(null); }
  };

  const handleToggle = async (userId) => {
    setUpdating(userId + '-toggle');
    try {
      const res = await adminAPI.toggleUser(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: res.data.is_active } : u));
    } catch (err) { alert(err.response?.data?.error || 'Failed to toggle user'); }
    finally { setUpdating(null); }
  };

  if (!['super_admin', 'hr_admin'].includes(user?.role)) return null;

  const f = (name, value) => setForm(prev => ({ ...prev, [name]: value }));

  const ROLE_LABELS = { employee: 'Employee', team_lead: 'Team Lead', hr_admin: 'HR Admin', super_admin: 'Super Admin' };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-oe-text">Admin Panel</h1>
            <p className="text-sm text-oe-muted">User &amp; Role Management</p>
          </div>
        </div>
        {activeTab === 'users' && (
          <button onClick={() => openCreateModal(users)} className="btn-primary">
            <UserPlus size={15} /> Create User
          </button>
        )}
        {activeTab === 'widgets' && (
          <button onClick={saveWidgets} disabled={widgetSaving} className="btn-primary">
            <Save size={15} />{widgetSaving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-oe-surface rounded-xl p-1 w-fit">
        {ADMIN_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === t.id ? 'bg-oe-card text-oe-text shadow' : 'text-oe-muted hover:text-oe-text'}`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {/* Widget Settings Panel */}
      {activeTab === 'widgets' && (
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-oe-text">Dashboard Widget Visibility</h2>
            <p className="text-sm text-oe-muted mt-0.5">Control which widgets appear on the dashboard for each role. Changes take effect immediately after saving.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-oe-border">
                  <th className="text-left py-3 pr-4 text-sm font-semibold text-oe-text min-w-[180px]">Widget</th>
                  {widgetRoles.map(role => (
                    <th key={role} className="text-center py-3 px-3 text-sm font-semibold text-oe-text capitalize min-w-[100px]">
                      {ROLE_LABELS[role] || role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {widgetDefs.map((w, i) => (
                  <tr key={w.key} className={`border-b border-oe-border/50 ${i % 2 === 0 ? '' : 'bg-oe-surface/30'}`}>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-oe-text text-sm">{w.label}</div>
                      <div className="text-xs text-oe-muted">{w.description}</div>
                    </td>
                    {widgetRoles.map(role => {
                      const isOn = widgetMatrix[w.key]?.[role] ?? false;
                      return (
                        <td key={role} className="text-center py-3 px-3">
                          <button onClick={() => handleWidgetToggle(w.key, role)}
                            className={`mx-auto transition-colors ${isOn ? 'text-oe-success' : 'text-oe-muted/30'}`}
                            title={isOn ? `Visible to ${ROLE_LABELS[role]}` : `Hidden from ${ROLE_LABELS[role]}`}>
                            {isOn ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {widgetDefs.length === 0 && (
            <div className="text-center py-8 text-oe-muted">
              <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading widget settings...
            </div>
          )}
        </div>
      )}

      {/* Users tab content */}
      {activeTab === 'users' && <>
      {/* Desktop table */}
      <div className="card p-0 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>{['User', 'Email', 'Role', 'Department', 'Status', 'Last Login', 'Actions'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-oe-muted">
                  <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />Loading...
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-oe-muted">No users found</td></tr>
              ) : users.map(u => {
                const isOwn = u.id === user?.id;
                return (
                  <tr key={u.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <Avatar src={u.avatar_url} firstName={u.first_name || u.email} lastName={u.last_name || ''} size={32} />
                        <div>
                          <div className="font-medium text-oe-text text-sm">{u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : '—'}</div>
                          <div className="text-xs text-oe-muted">{u.emp_code || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-sm text-oe-muted">{u.email}</td>
                    <td className="table-cell">
                      {isOwn ? (
                        <div>
                          <span className="badge-pending text-xs">{ROLE_OPTIONS.find(r => r.value === u.role)?.label || u.role}</span>
                          <div className="text-xs text-oe-muted mt-0.5">Own account</div>
                        </div>
                      ) : (
                        <select className="input text-xs py-1 px-2 w-36" value={u.role} disabled={updating === u.id + '-role'}
                          onChange={e => handleRoleChange(u.id, e.target.value)}>
                          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="table-cell text-xs text-oe-muted">{u.department_name || '—'}</td>
                    <td className="table-cell"><span className={u.is_active ? 'badge-active' : 'badge-inactive'}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="table-cell text-xs text-oe-muted">{fmtDate(u.last_login)}</td>
                    <td className="table-cell">
                      <button onClick={() => handleToggle(u.id)} disabled={updating === u.id + '-toggle'}
                        className={`p-1.5 rounded hover:bg-oe-surface transition-colors ${u.is_active ? 'text-oe-success hover:text-oe-danger' : 'text-oe-muted hover:text-oe-success'}`}
                        title={u.is_active ? 'Deactivate' : 'Activate'}>
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

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-12 text-oe-muted">
            <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />Loading...
          </div>
        ) : users.map(u => {
          const isOwn = u.id === user?.id;
          return (
            <div key={u.id} className="bg-white border border-oe-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar src={u.avatar_url} firstName={u.first_name || u.email} lastName={u.last_name || ''} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-oe-text text-sm">{u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : '—'}</div>
                  <div className="text-xs text-oe-muted truncate">{u.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={u.is_active ? 'badge-active' : 'badge-inactive'}>{u.is_active ? 'Active' : 'Inactive'}</span>
                  <button onClick={() => handleToggle(u.id)} disabled={updating === u.id + '-toggle'}
                    className={`p-1.5 rounded hover:bg-oe-surface transition-colors ${u.is_active ? 'text-oe-success hover:text-oe-danger' : 'text-oe-muted hover:text-oe-success'}`}>
                    {u.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-oe-muted">
                {u.department_name && <span className="px-2 py-0.5 bg-slate-100 rounded">{u.department_name}</span>}
                {u.emp_code && <span className="px-2 py-0.5 bg-slate-100 rounded">{u.emp_code}</span>}
                <span className="px-2 py-0.5 bg-slate-100 rounded">Login: {fmtDate(u.last_login)}</span>
              </div>
              <div>
                <label className="label">Role</label>
                {isOwn ? (
                  <span className="badge-pending text-xs">{ROLE_OPTIONS.find(r => r.value === u.role)?.label || u.role}</span>
                ) : (
                  <select className="input text-sm" value={u.role} disabled={updating === u.id + '-role'}
                    onChange={e => handleRoleChange(u.id, e.target.value)}>
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </> }

      {/* Create User Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create New User" size="sm">
        <div className="p-4 sm:p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{formError}</div>
          )}

          <div>
            <label className="label">Email Address *</label>
            <input type="email" className="input" placeholder="user@company.com"
              value={form.email} onChange={e => f('email', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input pr-10" placeholder="Min. 6 characters"
                  value={form.password} onChange={e => f('password', e.target.value)} />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-oe-muted hover:text-oe-text">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Confirm Password *</label>
              <input type={showPw ? 'text' : 'password'} className="input" placeholder="Repeat password"
                value={form.confirm_password} onChange={e => f('confirm_password', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Role *</label>
            <select className="input" value={form.role} onChange={e => f('role', e.target.value)}>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Link to Employee <span className="text-oe-muted font-normal">(optional)</span></label>
            <select className="input" value={form.employee_id} onChange={e => f('employee_id', e.target.value)}>
              <option value="">— Standalone account —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} · {e.employee_id} · {e.department_name || 'No dept'}
                </option>
              ))}
            </select>
            <p className="text-xs text-oe-muted mt-1">Only employees without an existing account are shown.</p>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-1">
            <button onClick={() => setShowModal(false)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary justify-center">
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

