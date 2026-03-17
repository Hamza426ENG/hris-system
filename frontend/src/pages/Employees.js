import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeesAPI, departmentsAPI } from '../services/api';
import Modal from '../components/Modal';
import { Plus, Search, Download, Eye, Edit, UserX, Users, CheckCircle2, Upload, FileSpreadsheet, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'consultant'];
const STATUSES = ['active', 'inactive', 'on_leave', 'terminated', 'probation'];
const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
const MARITAL = ['single', 'married', 'divorced', 'widowed'];

// Defined OUTSIDE the parent component so React never remounts it on re-render
const FormField = ({ label, name, type = 'text', options, required, value, onChange }) => (
  <div>
    <label className="label">{label}{required && <span className="text-oe-danger ml-0.5">*</span>}</label>
    {options ? (
      <select
        className="input"
        value={value || ''}
        onChange={e => onChange(name, e.target.value)}
      >
        <option value="">Select…</option>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? String(o).replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    ) : (
      <input
        type={type}
        className="input"
        value={value || ''}
        onChange={e => onChange(name, e.target.value)}
        required={required}
      />
    )}
  </div>
);

// ── Bulk Import ──────────────────────────────────────────────────────────────
const BULK_COLUMNS = [
  'first_name', 'last_name', 'work_email', 'personal_email',
  'phone_primary', 'hire_date', 'employment_type', 'status',
  'work_location', 'gender', 'nationality', 'national_id', 'city', 'state', 'country',
];

const downloadSampleExcel = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    BULK_COLUMNS,
    ['John', 'Doe', 'john.doe@company.com', 'john@personal.com', '+1-555-0100', '2024-01-15', 'full_time', 'active', 'New York', 'male', 'American', 'ID-001', 'New York', 'NY', 'USA'],
    ['Jane', 'Smith', 'jane.smith@company.com', '', '+1-555-0101', '2024-02-01', 'part_time', 'active', 'Remote', 'female', 'Canadian', '', 'Toronto', 'ON', 'Canada'],
  ]);
  // Column widths
  ws['!cols'] = BULK_COLUMNS.map(c => ({ wch: Math.max(c.length + 4, 16) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, 'employee_import_template.xlsx');
};

const BulkImportModal = ({ open, onClose, onDone }) => {
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const reset = () => { setRows([]); setErrors([]); setResult(null); if (fileRef.current) fileRef.current.value = ''; };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        // Normalise keys to lowercase with underscores
        const normalised = data.map(r => {
          const out = {};
          Object.entries(r).forEach(([k, v]) => {
            out[k.toLowerCase().replace(/\s+/g, '_')] = v instanceof Date
              ? v.toISOString().split('T')[0]
              : String(v).trim();
          });
          return out;
        });
        const errs = [];
        normalised.forEach((r, i) => {
          if (!r.first_name) errs.push(`Row ${i + 2}: first_name is required`);
          if (!r.last_name) errs.push(`Row ${i + 2}: last_name is required`);
          if (!r.hire_date) errs.push(`Row ${i + 2}: hire_date is required`);
          if (!r.work_email && !r.personal_email) errs.push(`Row ${i + 2}: work_email or personal_email required`);
        });
        setErrors(errs);
        setRows(normalised);
      } catch {
        setErrors(['Failed to parse file. Please use the provided template.']);
        setRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (errors.length > 0 || rows.length === 0) return;
    setImporting(true);
    try {
      const res = await employeesAPI.bulkImport(rows);
      setResult(res.data);
      onDone();
    } catch (err) {
      setErrors([err.response?.data?.error || 'Import failed']);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Import Employees" size="md">
      {result ? (
        <div className="p-6 text-center space-y-5">
          <div className="w-14 h-14 bg-oe-success/10 rounded-full flex items-center justify-center mx-auto ring-4 ring-oe-success/20">
            <CheckCircle2 size={28} className="text-oe-success" />
          </div>
          <div>
            <h3 className="font-semibold text-oe-text text-base">Import Complete</h3>
            <p className="text-sm text-oe-muted mt-1">{result.created} of {result.total} employees imported successfully.</p>
          </div>
          {result.errors?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-left space-y-1 max-h-40 overflow-y-auto">
              {result.errors.map((e, i) => (
                <div key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                  Row {e.row}: {e.error}
                </div>
              ))}
            </div>
          )}
          <button onClick={handleClose} className="btn-primary w-full justify-center">Done</button>
        </div>
      ) : (
        <div className="divide-y divide-oe-border">
          {/* Step 1: Download template */}
          <div className="px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-oe-primary text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</div>
              <span className="text-sm font-semibold text-oe-text">Download the template</span>
            </div>
            <p className="text-xs text-oe-muted mb-3 ml-7">Fill in employee details using the official Excel template. Required fields: first_name, last_name, hire_date, work_email.</p>
            <button onClick={downloadSampleExcel} className="btn-secondary ml-7 text-sm">
              <FileSpreadsheet size={15} /> Download Template (.xlsx)
            </button>
          </div>

          {/* Step 2: Upload file */}
          <div className="px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-oe-primary text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</div>
              <span className="text-sm font-semibold text-oe-text">Upload completed file</span>
            </div>
            <label className="ml-7 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-oe-border rounded-xl p-6 cursor-pointer hover:border-oe-primary hover:bg-oe-primary/5 transition-colors">
              <Upload size={22} className="text-oe-muted" />
              <span className="text-sm text-oe-muted">Click to select .xlsx or .xls file</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </label>
          </div>

          {/* Preview / errors */}
          {(rows.length > 0 || errors.length > 0) && (
            <div className="px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-oe-primary text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</div>
                  <span className="text-sm font-semibold text-oe-text">Review</span>
                </div>
                <button onClick={reset} className="text-xs text-oe-muted hover:text-oe-danger flex items-center gap-1">
                  <X size={12} /> Clear
                </button>
              </div>

              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 space-y-1 max-h-32 overflow-y-auto">
                  {errors.map((e, i) => (
                    <div key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                      <AlertCircle size={11} className="flex-shrink-0 mt-0.5" /> {e}
                    </div>
                  ))}
                </div>
              )}

              {rows.length > 0 && errors.length === 0 && (
                <div className="bg-oe-success/5 border border-oe-success/20 rounded-xl p-3 mb-3">
                  <p className="text-xs text-oe-success font-medium">{rows.length} employee record{rows.length > 1 ? 's' : ''} ready to import</p>
                </div>
              )}

              {rows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-oe-border">
                  <table className="w-full text-xs">
                    <thead className="bg-oe-surface">
                      <tr>
                        {['#', 'First Name', 'Last Name', 'Work Email', 'Hire Date', 'Type'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-oe-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-oe-border">
                      {rows.slice(0, 8).map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-oe-muted">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-oe-text">{r.first_name || <span className="text-red-400">—</span>}</td>
                          <td className="px-3 py-2 text-oe-text">{r.last_name || <span className="text-red-400">—</span>}</td>
                          <td className="px-3 py-2 text-oe-muted truncate max-w-[140px]">{r.work_email}</td>
                          <td className="px-3 py-2 text-oe-muted">{r.hire_date}</td>
                          <td className="px-3 py-2 text-oe-muted capitalize">{r.employment_type || 'full_time'}</td>
                        </tr>
                      ))}
                      {rows.length > 8 && (
                        <tr><td colSpan={6} className="px-3 py-2 text-center text-oe-muted italic">…and {rows.length - 8} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="px-5 py-4 sm:px-6 bg-oe-surface/40 flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={handleClose} className="btn-secondary justify-center">Cancel</button>
            <button
              onClick={handleImport}
              disabled={importing || rows.length === 0 || errors.length > 0}
              className="btn-primary justify-center min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing…</>
                : <><Upload size={15} /> Import {rows.length > 0 ? `${rows.length} Employees` : 'Employees'}</>
              }
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

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
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', department: '', status: '', employment_type: '' });
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'bulk'
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState(initForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const navigate = useNavigate();

  const handleFormChange = useCallback((name, value) => {
    setForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);

  // Employees redirect to their own profile
  useEffect(() => {
    if (user?.role === 'employee' && user?.employeeId) {
      navigate(`/employees/${user.employeeId}`, { replace: true });
    }
  }, [user, navigate]);

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

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
          <input className="input pl-9" placeholder="Search employees..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input w-full sm:w-44" value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="input w-full sm:w-36" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCSV} className="btn-secondary whitespace-nowrap flex-1 sm:flex-none justify-center"><Download size={15} /> Export</button>
          {isHR && (
            <>
              <button onClick={() => setBulkOpen(true)} className="btn-secondary whitespace-nowrap flex-1 sm:flex-none justify-center"><Upload size={15} /> Bulk Import</button>
              <button onClick={openAdd} className="btn-primary whitespace-nowrap flex-1 sm:flex-none justify-center"><Plus size={15} /> Add Employee</button>
            </>
          )}
        </div>
      </div>

      {/* Table header */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-oe-border">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-oe-primary" />
            <span className="font-semibold text-oe-text text-sm">{total} Employees</span>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
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

        {/* Mobile card list */}
        <div className="md:hidden">
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
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/employees/${emp.id}`)}
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
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} title={editId ? 'Edit Employee' : 'Add New Employee'} size="lg">
        <div className="divide-y divide-oe-border">

          {/* Personal Information */}
          <div className="px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-oe-primary" />
              <h4 className="text-xs font-semibold text-oe-text uppercase tracking-widest">Personal Information</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="First Name" name="first_name" required value={form.first_name} onChange={handleFormChange} />
              <FormField label="Last Name" name="last_name" required value={form.last_name} onChange={handleFormChange} />
              <FormField label="Middle Name" name="middle_name" value={form.middle_name} onChange={handleFormChange} />
              <FormField label="Date of Birth" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleFormChange} />
              <FormField label="Gender" name="gender" options={GENDERS.map(g => ({ value: g, label: g.replace(/_/g, ' ') }))} value={form.gender} onChange={handleFormChange} />
              <FormField label="Marital Status" name="marital_status" options={MARITAL.map(m => ({ value: m, label: m }))} value={form.marital_status} onChange={handleFormChange} />
              <FormField label="Nationality" name="nationality" value={form.nationality} onChange={handleFormChange} />
              <FormField label="National ID" name="national_id" value={form.national_id} onChange={handleFormChange} />
            </div>
          </div>

          {/* Contact Information */}
          <div className="px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-oe-purple" />
              <h4 className="text-xs font-semibold text-oe-text uppercase tracking-widest">Contact Information</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Work Email" name="work_email" type="email" value={form.work_email} onChange={handleFormChange} />
              <FormField label="Personal Email" name="personal_email" type="email" value={form.personal_email} onChange={handleFormChange} />
              <FormField label="Primary Phone" name="phone_primary" value={form.phone_primary} onChange={handleFormChange} />
              <FormField label="Secondary Phone" name="phone_secondary" value={form.phone_secondary} onChange={handleFormChange} />
              <FormField label="Address" name="address_line1" value={form.address_line1} onChange={handleFormChange} />
              <FormField label="City" name="city" value={form.city} onChange={handleFormChange} />
              <FormField label="State / Province" name="state" value={form.state} onChange={handleFormChange} />
              <FormField label="Country" name="country" value={form.country} onChange={handleFormChange} />
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-oe-danger" />
              <h4 className="text-xs font-semibold text-oe-text uppercase tracking-widest">Emergency Contact</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="Contact Name" name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleFormChange} />
              <FormField label="Relation" name="emergency_contact_relation" value={form.emergency_contact_relation} onChange={handleFormChange} />
              <FormField label="Phone" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleFormChange} />
            </div>
          </div>

          {/* Employment Details */}
          <div className="px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-oe-success" />
              <h4 className="text-xs font-semibold text-oe-text uppercase tracking-widest">Employment Details</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="Department" name="department_id" options={departments.map(d => ({ value: d.id, label: d.name }))} value={form.department_id} onChange={handleFormChange} />
              <FormField label="Employment Type" name="employment_type" options={EMPLOYMENT_TYPES.map(t => ({ value: t, label: t.replace(/_/g, ' ') }))} value={form.employment_type} onChange={handleFormChange} />
              <FormField label="Status" name="status" options={STATUSES.map(s => ({ value: s, label: s.replace(/_/g, ' ') }))} value={form.status} onChange={handleFormChange} />
              <FormField label="Hire Date" name="hire_date" type="date" required value={form.hire_date} onChange={handleFormChange} />
              <FormField label="Work Location" name="work_location" value={form.work_location} onChange={handleFormChange} />
            </div>
          </div>

          {/* Footer actions */}
          <div className="px-5 py-4 sm:px-6 bg-oe-surface/40 flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setModal(null)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary justify-center min-w-[140px]">
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                : editId ? 'Update Employee' : 'Create Employee'
              }
            </button>
          </div>
        </div>
      </Modal>

      {/* Success modal */}
      <Modal open={modal === 'success'} onClose={() => setModal(null)} title="Employee Created" size="sm">
        <div className="p-6 text-center space-y-5">
          <div className="w-14 h-14 bg-oe-success/10 rounded-full flex items-center justify-center mx-auto ring-4 ring-oe-success/20">
            <CheckCircle2 size={28} className="text-oe-success" />
          </div>
          <div>
            <h3 className="font-semibold text-oe-text text-base">Employee added successfully!</h3>
            <p className="text-xs text-oe-muted mt-1">Share the temporary credentials below.</p>
          </div>
          <div className="bg-oe-surface border border-oe-border rounded-xl p-4 text-left space-y-1">
            <div className="text-xs font-medium text-oe-muted uppercase tracking-wider">Temporary Password</div>
            <div className="font-mono text-oe-text text-sm font-semibold tracking-wide">{newEmpPassword}</div>
            <div className="text-xs text-oe-muted pt-1 border-t border-oe-border mt-2">The employee should change this on first login.</div>
          </div>
          <button onClick={() => setModal(null)} className="btn-primary w-full justify-center">Done</button>
        </div>
      </Modal>

      <BulkImportModal open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={() => { load(); }} />
    </div>
  );
}
