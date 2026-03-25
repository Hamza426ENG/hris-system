import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { employeesAPI, departmentsAPI } from '@/services/api';
import Modal from '@/components/common/Modal';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Plus, Search, Download, Eye, Edit, UserX, UserCheck, Users, RefreshCw, Archive, UserCog, Clock, CalendarOff, Building2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

const initForm = {
  first_name: '', last_name: '', middle_name: '', date_of_birth: '', gender: '', marital_status: '',
  nationality: '', national_id: '', personal_email: '', work_email: '', phone_primary: '', phone_secondary: '',
  address_line1: '', city: '', state: '', country: 'USA', postal_code: '',
  emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_phone: '',
  department_id: '', position_id: '', manager_id: '', employment_type: 'full_time', status: 'active',
  hire_date: '', work_location: '', bio: '',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

// Defined outside component so React doesn't recreate it on every render (prevents focus loss)
function FormField({ label, name, type = 'text', options, required, form, setForm }) {
  return (
    <div>
      <label className="label">{label}{required && ' *'}</label>
      {options ? (
        <select className="input" value={form[name] || ''} onChange={e => setForm({ ...form, [name]: e.target.value })}>
          <option value="">Select...</option>
          {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o.replace('_', ' ')}</option>)}
        </select>
      ) : (
        <input type={type} className="input" value={form[name] || ''} onChange={e => setForm({ ...form, [name]: e.target.value })} required={required} />
      )}
    </div>
  );
}

function EmployeesContent() {
  const { user } = useAuth();
  const { employmentTypes: EMPLOYMENT_TYPES, employeeStatuses: STATUSES, genders: GENDERS, maritalStatuses: MARITAL } = useConfig();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', department: '', status: '', employment_type: '' });
  const [view, setView] = useState('active'); // 'active' or 'archived'
  const [activeFilter, setActiveFilter] = useState(''); // '', 'probation', 'present', 'on_leave'
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(initForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const LIMIT = 50;
  const totalPages = Math.ceil(total / LIMIT);
  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);

  // Only HR and super_admin can view the employees list; everyone else goes to their own profile
  useEffect(() => {
    if (user && !isHR) {
      router.replace(user.employeeId ? `/employees/${user.employeeId}` : '/');
    }
  }, [user, isHR, router]);

  // load(pageNum) — pass explicit page so filter changes reset to page 1 cleanly
  const load = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setPage(pageNum);
    try {
      const res = await employeesAPI.list({ ...filters, view, active_filter: view === 'active' ? activeFilter : '', page: pageNum, limit: LIMIT });
      setEmployees(res.data.data);
      setTotal(res.data.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filters, view, activeFilter]);

  // Re-run (from page 1) whenever filters change
  useEffect(() => { load(1); }, [load]);
  useEffect(() => { departmentsAPI.list().then(r => setDepartments(r.data)).catch(console.error); }, []);

  const openAdd = () => { setForm(initForm); setEditId(null); setNewEmpPassword(''); setModal('add'); };
  const openEdit = (emp, e) => {
    e.stopPropagation();
    setForm({
      first_name: emp.first_name || '', last_name: emp.last_name || '', middle_name: emp.middle_name || '',
      date_of_birth: emp.date_of_birth ? emp.date_of_birth.split('T')[0] : '',
      gender: emp.gender || '', marital_status: emp.marital_status || '',
      nationality: emp.nationality || '', national_id: emp.national_id || '',
      personal_email: emp.personal_email || '', work_email: emp.work_email || '',
      phone_primary: emp.phone_primary || '', phone_secondary: emp.phone_secondary || '',
      address_line1: emp.address_line1 || '', city: emp.city || '', state: emp.state || '',
      country: emp.country || 'USA', postal_code: emp.postal_code || '',
      emergency_contact_name: emp.emergency_contact_name || '',
      emergency_contact_relation: emp.emergency_contact_relation || '',
      emergency_contact_phone: emp.emergency_contact_phone || '',
      department_id: emp.department_id || '', position_id: emp.position_id || '',
      manager_id: emp.manager_id || '', employment_type: emp.employment_type || 'full_time',
      status: emp.status || 'active', hire_date: emp.hire_date ? emp.hire_date.split('T')[0] : '',
      work_location: emp.work_location || '', bio: emp.bio || '',
    });
    setEditId(emp.id);
    setModal('edit');
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.hire_date) {
      alert('First name, last name and hire date are required'); return;
    }
    setSaving(true);
    try {
      if (editId) {
        await employeesAPI.update(editId, form);
      } else {
        const res = await employeesAPI.create(form);
        if (res.data.tempPassword) setNewEmpPassword(res.data.tempPassword);
      }
      setModal(editId ? null : 'success');
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save employee');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = (emp, e) => {
    e.stopPropagation();
    const isTerminated = emp.status === 'terminated';
    setConfirm({
      title: isTerminated ? 'Activate Employee' : 'Deactivate Employee',
      message: isTerminated
        ? `Reactivate ${emp.first_name} ${emp.last_name}? They will regain access to the system.`
        : `Deactivate ${emp.first_name} ${emp.last_name}? They will lose system access.`,
      confirmLabel: isTerminated ? 'Activate' : 'Deactivate',
      variant: isTerminated ? 'success' : 'warning',
      onConfirm: async () => {
        setConfirming(true);
        try {
          if (isTerminated) await employeesAPI.activate(emp.id);
          else await employeesAPI.delete(emp.id);
          load();
        } finally { setConfirming(false); setConfirm(null); }
      },
    });
  };

  const exportCSV = () => {
    const headers = ['ID', 'Name', 'Email', 'Department', 'Position', 'Status', 'Hire Date'];
    const rows = employees.map(e => [e.employee_id, `${e.first_name} ${e.last_name}`, e.work_email, e.department_name, e.position_title, e.status, fmtDate(e.hire_date)]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'employees.csv'; a.click();
  };

  const statusBadge = (s) => {
    const map = { active: 'badge-active', inactive: 'badge-inactive', on_leave: 'badge-pending', terminated: 'badge-rejected', probation: 'badge-pending' };
    return <span className={map[s] || 'badge-inactive'}>{s?.replace('_', ' ')}</span>;
  };

  const startRow = (page - 1) * LIMIT + 1;
  const endRow = Math.min(page * LIMIT, total);

  return (
    <div className="flex flex-col h-full gap-3 pb-20 sm:pb-16">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex flex-col gap-3">
        {/* Row 1: search + action buttons */}
        <div className="flex gap-2 w-full">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted pointer-events-none" />
            <input className="input pl-9 text-sm" placeholder="Search employees…" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {user?.role === 'super_admin' && (
              <button onClick={() => load(page)} disabled={loading} className="btn-secondary px-2.5" title="Refresh">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
            <button onClick={exportCSV} className="btn-secondary px-2.5" title="Export CSV">
              <Download size={14} />
            </button>
            {isHR && (
              <button onClick={openAdd} className="btn-primary whitespace-nowrap flex items-center gap-1.5 px-3 text-sm">
                <Plus size={14} /> <span className="hidden sm:inline">Add Employee</span><span className="sm:hidden">Add</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Active / Archived tabs + Department filter */}
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          {/* View tabs */}
          <div className="flex bg-oe-surface rounded-lg p-1 gap-1 flex-shrink-0">
            <button
              onClick={() => { setView('active'); setActiveFilter(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${view === 'active' ? 'bg-oe-primary text-white shadow-sm' : 'text-oe-muted hover:text-oe-text hover:bg-oe-bg'}`}
            >
              <Users size={15} />
              Active
            </button>
            <button
              onClick={() => { setView('archived'); setActiveFilter(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${view === 'archived' ? 'bg-oe-primary text-white shadow-sm' : 'text-oe-muted hover:text-oe-text hover:bg-oe-bg'}`}
            >
              <Archive size={15} />
              Archived
            </button>
          </div>

          {/* Department filter — prominent */}
          <div className="relative flex-1 min-w-0">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-primary pointer-events-none" />
            <select
              className="input pl-9 text-sm font-medium border-oe-primary/30 focus:border-oe-primary w-full"
              value={filters.department}
              onChange={e => setFilters({ ...filters, department: e.target.value })}
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        {/* Row 3: Sub-filters for Active view */}
        {view === 'active' && (
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'probation', label: 'Probation', icon: UserCog },
              { key: 'present', label: 'Present Today', icon: Clock },
              { key: 'on_leave', label: 'On Leave', icon: CalendarOff },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(activeFilter === f.key ? '' : f.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                  activeFilter === f.key
                    ? 'bg-oe-primary/10 border-oe-primary text-oe-primary shadow-sm'
                    : 'border-oe-border text-oe-muted hover:text-oe-text hover:border-oe-text/30 hover:bg-oe-surface'
                }`}
              >
                <f.icon size={14} />
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table card — fills remaining viewport height */}
      <div className="card p-0 flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Card header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-oe-border">
          {view === 'archived' ? <Archive size={15} className="text-oe-muted flex-shrink-0" /> : <Users size={15} className="text-oe-primary flex-shrink-0" />}
          <span className="font-semibold text-oe-text text-sm">{loading ? 'Loading…' : `${total} ${view === 'archived' ? 'Archived' : 'Active'} Employees`}</span>
        </div>

        {/* Desktop table — scrolls internally */}
        <div className="hidden md:flex flex-col flex-1 min-h-0 overflow-auto">
          <table className="w-full">
            <thead className="bg-oe-surface/95 sticky top-0 z-10">
              <tr>
                <th className="table-header">Employee</th>
                <th className="table-header">Department</th>
                <th className="table-header">Position</th>
                <th className="table-header">Type</th>
                <th className="table-header">Hire Date</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-oe-muted">
                  <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading...
                </td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-oe-muted">No employees found</td></tr>
              ) : employees.map(emp => (
                <tr key={emp.id} className="table-row cursor-pointer" onClick={() => router.push(`/employees/${emp.id}`)}>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-oe-border">
                        <img
                          src={emp.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${emp.first_name} ${emp.last_name}`)}&backgroundColor=1D6BE4,7C5CFC&backgroundType=gradientLinear&fontSize=36&fontWeight=600`}
                          alt={`${emp.first_name} ${emp.last_name}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="font-medium text-oe-text">{emp.first_name} {emp.last_name}</div>
                        <div className="text-xs text-oe-muted">{emp.employee_id} · {emp.work_email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-oe-muted">{emp.department_name || '-'}</td>
                  <td className="table-cell text-oe-muted">{emp.position_title || '-'}</td>
                  <td className="table-cell"><span className="text-xs text-oe-muted capitalize">{emp.employment_type?.replace('_', ' ')}</span></td>
                  <td className="table-cell text-oe-muted text-xs">{fmtDate(emp.hire_date)}</td>
                  <td className="table-cell">{statusBadge(emp.status)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={e => { e.stopPropagation(); router.push(`/employees/${emp.id}`); }} className="p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted hover:text-oe-text transition-colors" data-tip="View">
                        <Eye size={14} />
                      </button>
                      {isHR && (
                        <>
                          <button onClick={(e) => openEdit(emp, e)} className="p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted hover:text-oe-primary transition-colors" data-tip="Edit">
                            <Edit size={14} />
                          </button>
                          <button onClick={(e) => handleToggleStatus(emp, e)} className={`p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted transition-colors ${emp.status === 'terminated' ? 'hover:text-oe-success' : 'hover:text-oe-danger'}`} data-tip={emp.status === 'terminated' ? 'Activate' : 'Deactivate'}>
                            {emp.status === 'terminated' ? <UserCheck size={14} /> : <UserX size={14} />}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list — scrolls internally */}
        <div className="md:hidden flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="text-center py-12 text-oe-muted">
              <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading...
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-12 text-oe-muted">No employees found</div>
          ) : (
            <div className="divide-y divide-oe-border">
              {employees.map(emp => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-oe-bg cursor-pointer"
                  onClick={() => router.push(`/employees/${emp.id}`)}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-oe-border">
                    <img
                      src={emp.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${emp.first_name} ${emp.last_name}`)}&backgroundColor=1D6BE4,7C5CFC&backgroundType=gradientLinear&fontSize=36&fontWeight=600`}
                      alt={`${emp.first_name} ${emp.last_name}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-oe-text text-sm truncate">{emp.first_name} {emp.last_name}</div>
                    <div className="text-xs text-oe-muted truncate">{emp.position_title || '-'}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {emp.department_name && (
                        <span className="text-xs px-1.5 py-0.5 bg-oe-surface rounded text-oe-muted">{emp.department_name}</span>
                      )}
                      {statusBadge(emp.status)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="text-xs text-oe-muted">{fmtDate(emp.hire_date)}</div>
                    {isHR && (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => openEdit(emp, e)}
                          data-tip="Edit"
                          className="p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted hover:text-oe-primary transition-colors"
                        >
                          <Edit size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-oe-border bg-oe-surface/30 gap-3">
            <button
              onClick={() => load(page - 1)}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-oe-border text-oe-text hover:bg-oe-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← <span className="hidden sm:inline">Prev</span>
            </button>
            <span className="text-xs text-oe-muted text-center">
              <span className="hidden sm:inline">Page </span>{page} / {totalPages}
              <span className="hidden sm:inline text-oe-muted/60"> · {startRow}–{endRow} of {total}</span>
            </span>
            <button
              onClick={() => load(page + 1)}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-oe-border text-oe-text hover:bg-oe-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span className="hidden sm:inline">Next</span> →
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} title={editId ? 'Edit Employee' : 'Add New Employee'} size="lg">
        <div className="p-4 sm:p-6 space-y-6">
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField form={form} setForm={setForm} label="First Name" name="first_name" required />
              <FormField form={form} setForm={setForm} label="Last Name" name="last_name" required />
              <FormField form={form} setForm={setForm} label="Middle Name" name="middle_name" />
              <FormField form={form} setForm={setForm} label="Date of Birth" name="date_of_birth" type="date" />
              <FormField form={form} setForm={setForm} label="Gender" name="gender" options={GENDERS.map(g => ({ value: g, label: g.replace('_', ' ') }))} />
              <FormField form={form} setForm={setForm} label="Marital Status" name="marital_status" options={MARITAL.map(m => ({ value: m, label: m }))} />
              <FormField form={form} setForm={setForm} label="Nationality" name="nationality" />
              <FormField form={form} setForm={setForm} label="National ID" name="national_id" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Contact Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField form={form} setForm={setForm} label="Work Email" name="work_email" type="email" />
              <FormField form={form} setForm={setForm} label="Personal Email" name="personal_email" type="email" />
              <FormField form={form} setForm={setForm} label="Primary Phone" name="phone_primary" />
              <FormField form={form} setForm={setForm} label="Secondary Phone" name="phone_secondary" />
              <FormField form={form} setForm={setForm} label="Address" name="address_line1" />
              <FormField form={form} setForm={setForm} label="City" name="city" />
              <FormField form={form} setForm={setForm} label="State" name="state" />
              <FormField form={form} setForm={setForm} label="Country" name="country" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Emergency Contact</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField form={form} setForm={setForm} label="Name" name="emergency_contact_name" />
              <FormField form={form} setForm={setForm} label="Relation" name="emergency_contact_relation" />
              <FormField form={form} setForm={setForm} label="Phone" name="emergency_contact_phone" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Employment Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField form={form} setForm={setForm} label="Department" name="department_id" options={departments.map(d => ({ value: d.id, label: d.name }))} />
              <FormField form={form} setForm={setForm} label="Employment Type" name="employment_type" options={EMPLOYMENT_TYPES.map(t => ({ value: t, label: t.replace('_', ' ') }))} />
              <FormField form={form} setForm={setForm} label="Status" name="status" options={STATUSES.map(s => ({ value: s, label: s.replace('_', ' ') }))} />
              <FormField form={form} setForm={setForm} label="Hire Date" name="hire_date" type="date" required />
              <FormField form={form} setForm={setForm} label="Work Location" name="work_location" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
            <button onClick={() => setModal(null)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary justify-center">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {saving ? 'Saving...' : editId ? 'Update Employee' : 'Create Employee'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Success modal */}
      <Modal open={modal === 'success'} onClose={() => setModal(null)} title="Employee Created" size="sm">
        <div className="p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-oe-success/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={24} className="text-oe-success" />
          </div>
          <h3 className="font-semibold text-oe-text">Employee added successfully!</h3>
          <div className="bg-oe-surface rounded-lg p-4 text-left">
            <div className="text-xs text-oe-muted mb-1">Temporary Password</div>
            <div className="font-mono text-oe-text text-sm font-semibold">{newEmpPassword}</div>
            <div className="text-xs text-oe-muted mt-2">Share this with the employee. They should change it on first login.</div>
          </div>
          <button onClick={() => setModal(null)} className="btn-primary w-full justify-center">Done</button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant}
        loading={confirming}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <PrivateRoute>
      <Layout>
        <EmployeesContent />
      </Layout>
    </PrivateRoute>
  );
}
