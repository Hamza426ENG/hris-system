import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeesAPI, departmentsAPI } from '../services/api';
import Modal from '../components/Modal';
import { Plus, Search, Filter, Download, Eye, Edit, UserX, Users } from 'lucide-react';

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'consultant'];
const STATUSES = ['active', 'inactive', 'on_leave', 'terminated', 'probation'];
const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
const MARITAL = ['single', 'married', 'divorced', 'widowed'];

const initForm = {
  first_name: '', last_name: '', middle_name: '', date_of_birth: '', gender: '', marital_status: '',
  nationality: '', national_id: '', personal_email: '', work_email: '', phone_primary: '', phone_secondary: '',
  address_line1: '', city: '', state: '', country: 'USA', postal_code: '',
  emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_phone: '',
  department_id: '', position_id: '', manager_id: '', employment_type: 'full_time', status: 'active',
  hire_date: '', work_location: '', bio: '',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', department: '', status: '', employment_type: '' });
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [form, setForm] = useState(initForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await employeesAPI.list({ ...filters });
      setEmployees(res.data.data);
      setTotal(res.data.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
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

  const handleDeactivate = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Deactivate this employee?')) return;
    await employeesAPI.delete(id);
    load();
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

  const FormField = ({ label, name, type = 'text', options, required }) => (
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

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
          <input className="input pl-9" placeholder="Search employees..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <select className="input w-44" value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="input w-36" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <button onClick={exportCSV} className="btn-secondary whitespace-nowrap"><Download size={15} /> Export</button>
        <button onClick={openAdd} className="btn-primary whitespace-nowrap"><Plus size={15} /> Add Employee</button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-oe-border">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-oe-primary" />
            <span className="font-semibold text-oe-text text-sm">{total} Employees</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-oe-surface/50">
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
                <tr key={emp.id} className="table-row cursor-pointer" onClick={() => navigate(`/employees/${emp.id}`)}>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                        {`${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase()}
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
                      <button onClick={e => { e.stopPropagation(); navigate(`/employees/${emp.id}`); }} className="p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted hover:text-oe-text transition-colors" title="View">
                        <Eye size={14} />
                      </button>
                      <button onClick={(e) => openEdit(emp, e)} className="p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted hover:text-oe-primary transition-colors" title="Edit">
                        <Edit size={14} />
                      </button>
                      <button onClick={(e) => handleDeactivate(emp.id, e)} className="p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted hover:text-oe-danger transition-colors" title="Deactivate">
                        <UserX size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} title={editId ? 'Edit Employee' : 'Add New Employee'} size="lg">
        <div className="p-6 space-y-6">
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="First Name" name="first_name" required />
              <FormField label="Last Name" name="last_name" required />
              <FormField label="Middle Name" name="middle_name" />
              <FormField label="Date of Birth" name="date_of_birth" type="date" />
              <FormField label="Gender" name="gender" options={GENDERS.map(g => ({ value: g, label: g.replace('_', ' ') }))} />
              <FormField label="Marital Status" name="marital_status" options={MARITAL.map(m => ({ value: m, label: m }))} />
              <FormField label="Nationality" name="nationality" />
              <FormField label="National ID" name="national_id" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Contact Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Work Email" name="work_email" type="email" />
              <FormField label="Personal Email" name="personal_email" type="email" />
              <FormField label="Primary Phone" name="phone_primary" />
              <FormField label="Secondary Phone" name="phone_secondary" />
              <FormField label="Address" name="address_line1" />
              <FormField label="City" name="city" />
              <FormField label="State" name="state" />
              <FormField label="Country" name="country" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Emergency Contact</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Name" name="emergency_contact_name" />
              <FormField label="Relation" name="emergency_contact_relation" />
              <FormField label="Phone" name="emergency_contact_phone" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Employment Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Department" name="department_id" options={departments.map(d => ({ value: d.id, label: d.name }))} />
              <FormField label="Employment Type" name="employment_type" options={EMPLOYMENT_TYPES.map(t => ({ value: t, label: t.replace('_', ' ') }))} />
              <FormField label="Status" name="status" options={STATUSES.map(s => ({ value: s, label: s.replace('_', ' ') }))} />
              <FormField label="Hire Date" name="hire_date" type="date" required />
              <FormField label="Work Location" name="work_location" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
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
    </div>
  );
}
