import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { employeesAPI, leavesAPI, salaryAPI } from '../services/api';
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Briefcase, User, DollarSign, Clock, Plus, Edit } from 'lucide-react';
import Modal from '../components/Modal';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '-';
const fmtCurrency = (n) => n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '-';

const TABS = ['Overview', 'Leave History', 'Salary & Comp', 'Payroll History'];

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emp, setEmp] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [salary, setSalary] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [balances, setBalances] = useState([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [salaryModal, setSalaryModal] = useState(false);
  const [salaryForm, setSalaryForm] = useState({ basic_salary: '', housing_allowance: '', transport_allowance: '', meal_allowance: '', medical_allowance: '', mobile_allowance: '', other_allowances: '', tax_deduction: '', pension_deduction: '', health_insurance: '', other_deductions: '', effective_date: new Date().toISOString().split('T')[0], notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    employeesAPI.get(id).then(r => setEmp(r.data)).catch(() => navigate('/employees')).finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (!emp) return;
    employeesAPI.getLeaves(id).then(r => setLeaves(r.data)).catch(console.error);
    employeesAPI.getSalary(id).then(r => setSalary(r.data)).catch(console.error);
    employeesAPI.getPayroll(id).then(r => setPayroll(r.data)).catch(console.error);
    leavesAPI.balances(id).then(r => setBalances(r.data)).catch(console.error);
  }, [emp, id]);

  const handleSalary = async () => {
    if (!salaryForm.basic_salary) { alert('Basic salary required'); return; }
    setSaving(true);
    try {
      await salaryAPI.create({ employee_id: id, ...salaryForm });
      employeesAPI.getSalary(id).then(r => setSalary(r.data));
      setSalaryModal(false);
    } catch (err) { alert(err.response?.data?.error || 'Failed to save salary'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!emp) return null;

  const currentSalary = salary[0];
  const statusBadge = (s) => {
    const map = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', cancelled: 'badge-inactive' };
    return <span className={map[s] || 'badge-inactive'}>{s}</span>;
  };

  const SField = ({ name, label }) => (
    <div>
      <label className="label">{label}</label>
      <input type="number" step="0.01" className="input" value={salaryForm[name] || ''} onChange={e => setSalaryForm({ ...salaryForm, [name]: e.target.value })} placeholder="0.00" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={() => navigate('/employees')} className="flex items-center gap-2 text-oe-muted hover:text-oe-text transition-colors text-sm">
        <ArrowLeft size={16} /> Back to Employees
      </button>

      {/* Header Card */}
      <div className="card">
        <div className="flex flex-wrap items-start gap-5">
          <div className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
            {`${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-oe-text">{emp.first_name} {emp.last_name}</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                emp.status === 'active' ? 'badge-active' : 'badge-inactive'
              }`}>{emp.status}</span>
            </div>
            <div className="text-oe-muted text-sm mb-3">{emp.position_title} {emp.department_name ? `· ${emp.department_name}` : ''}</div>
            <div className="flex flex-wrap gap-4 text-sm text-oe-muted">
              <span className="flex items-center gap-1"><Briefcase size={13} /> {emp.employee_id}</span>
              {emp.work_email && <span className="flex items-center gap-1"><Mail size={13} /> {emp.work_email}</span>}
              {emp.phone_primary && <span className="flex items-center gap-1"><Phone size={13} /> {emp.phone_primary}</span>}
              {emp.city && <span className="flex items-center gap-1"><MapPin size={13} /> {emp.city}, {emp.country}</span>}
              <span className="flex items-center gap-1"><Calendar size={13} /> Joined {fmtDate(emp.hire_date)}</span>
            </div>
          </div>
          {currentSalary && (
            <div className="text-right">
              <div className="text-xs text-oe-muted mb-0.5">Current Salary</div>
              <div className="text-xl font-bold text-oe-text">{fmtCurrency(currentSalary.gross_salary)}</div>
              <div className="text-xs text-oe-muted">gross/month</div>
            </div>
          )}
        </div>
      </div>

      {/* Leave Balances */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {balances.map(b => (
            <div key={b.id} className="card py-3 text-center hover:border-oe-primary/30 transition-colors">
              <div className="text-xl font-bold text-oe-text mb-0.5">{parseFloat(b.available_days) || 0}</div>
              <div className="text-xs font-medium text-oe-text mb-0.5">{b.leave_type_name}</div>
              <div className="text-xs text-oe-muted">{b.used_days} used / {b.allocated_days} total</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-oe-surface rounded-xl p-1 w-fit">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === i ? 'bg-oe-card text-oe-text shadow' : 'text-oe-muted hover:text-oe-text'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card space-y-4">
            <h3 className="font-semibold text-oe-text flex items-center gap-2"><User size={15} className="text-oe-primary" /> Personal Details</h3>
            {[
              ['Full Name', `${emp.first_name} ${emp.middle_name || ''} ${emp.last_name}`],
              ['Date of Birth', fmtDate(emp.date_of_birth)],
              ['Gender', emp.gender?.replace('_', ' ') || '-'],
              ['Marital Status', emp.marital_status || '-'],
              ['Nationality', emp.nationality || '-'],
              ['National ID', emp.national_id || '-'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-oe-border/50 pb-2 last:border-0 last:pb-0">
                <span className="text-oe-muted">{k}</span>
                <span className="text-oe-text capitalize">{v}</span>
              </div>
            ))}
          </div>

          <div className="card space-y-4">
            <h3 className="font-semibold text-oe-text flex items-center gap-2"><Briefcase size={15} className="text-oe-primary" /> Employment Details</h3>
            {[
              ['Employee ID', emp.employee_id],
              ['Department', emp.department_name || '-'],
              ['Position', emp.position_title || '-'],
              ['Grade', emp.grade || '-'],
              ['Employment Type', emp.employment_type?.replace('_', ' ') || '-'],
              ['Manager', emp.manager_name || '-'],
              ['Hire Date', fmtDate(emp.hire_date)],
              ['Work Location', emp.work_location || '-'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-oe-border/50 pb-2 last:border-0 last:pb-0">
                <span className="text-oe-muted">{k}</span>
                <span className="text-oe-text capitalize">{v}</span>
              </div>
            ))}
          </div>

          <div className="card space-y-4">
            <h3 className="font-semibold text-oe-text flex items-center gap-2"><Phone size={15} className="text-oe-primary" /> Contact Info</h3>
            {[
              ['Work Email', emp.work_email || '-'],
              ['Personal Email', emp.personal_email || '-'],
              ['Phone', emp.phone_primary || '-'],
              ['Address', [emp.address_line1, emp.city, emp.state, emp.country].filter(Boolean).join(', ') || '-'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-oe-border/50 pb-2 last:border-0 last:pb-0">
                <span className="text-oe-muted">{k}</span>
                <span className="text-oe-text">{v}</span>
              </div>
            ))}
          </div>

          <div className="card space-y-4">
            <h3 className="font-semibold text-oe-text flex items-center gap-2"><User size={15} className="text-oe-primary" /> Emergency Contact</h3>
            {[
              ['Name', emp.emergency_contact_name || '-'],
              ['Relation', emp.emergency_contact_relation || '-'],
              ['Phone', emp.emergency_contact_phone || '-'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-oe-border/50 pb-2 last:border-0 last:pb-0">
                <span className="text-oe-muted">{k}</span>
                <span className="text-oe-text">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Leave History */}
      {tab === 1 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-oe-border flex items-center justify-between">
            <span className="font-semibold text-oe-text text-sm">Leave History</span>
          </div>
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>
                {['Type', 'Start', 'End', 'Days', 'Reason', 'Status', 'Reviewed By'].map(h => <th key={h} className="table-header">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-oe-muted text-sm">No leave history</td></tr>
              ) : leaves.map(l => (
                <tr key={l.id} className="table-row">
                  <td className="table-cell"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: l.color }} />{l.leave_type_name}</div></td>
                  <td className="table-cell text-xs">{fmtDate(l.start_date)}</td>
                  <td className="table-cell text-xs">{fmtDate(l.end_date)}</td>
                  <td className="table-cell">{l.total_days}</td>
                  <td className="table-cell text-oe-muted text-xs max-w-32 truncate">{l.reason}</td>
                  <td className="table-cell">{statusBadge(l.status)}</td>
                  <td className="table-cell text-xs text-oe-muted">{l.reviewer_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Salary */}
      {tab === 2 && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setSalaryModal(true)} className="btn-primary"><Plus size={15} /> Add Salary Structure</button>
          </div>
          {currentSalary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card">
                <h4 className="font-semibold text-oe-text mb-4 text-sm">Earnings</h4>
                {[['Basic Salary', currentSalary.basic_salary], ['Housing', currentSalary.housing_allowance], ['Transport', currentSalary.transport_allowance], ['Meal', currentSalary.meal_allowance], ['Medical', currentSalary.medical_allowance], ['Mobile', currentSalary.mobile_allowance], ['Other', currentSalary.other_allowances]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm py-1.5 border-b border-oe-border/30 last:border-0">
                    <span className="text-oe-muted">{k}</span>
                    <span className="text-oe-text">{fmtCurrency(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm py-2 mt-1 font-semibold">
                  <span className="text-oe-text">Gross Salary</span>
                  <span className="text-oe-success">{fmtCurrency(currentSalary.gross_salary)}</span>
                </div>
              </div>
              <div className="card">
                <h4 className="font-semibold text-oe-text mb-4 text-sm">Deductions</h4>
                {[['Tax', currentSalary.tax_deduction], ['Pension', currentSalary.pension_deduction], ['Health Insurance', currentSalary.health_insurance], ['Other', currentSalary.other_deductions]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm py-1.5 border-b border-oe-border/30 last:border-0">
                    <span className="text-oe-muted">{k}</span>
                    <span className="text-oe-danger">-{fmtCurrency(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm py-2 mt-1 font-semibold">
                  <span className="text-oe-text">Net Salary</span>
                  <span className="text-oe-primary">{fmtCurrency(currentSalary.net_salary)}</span>
                </div>
              </div>
            </div>
          )}
          {!currentSalary && <div className="card text-center py-8 text-oe-muted">No salary structure defined. Click "Add Salary Structure" to begin.</div>}
        </div>
      )}

      {/* Tab: Payroll */}
      {tab === 3 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-oe-border">
            <span className="font-semibold text-oe-text text-sm">Payroll History</span>
          </div>
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>
                {['Period', 'Gross', 'Deductions', 'Net', 'Leave Days', 'Status'].map(h => <th key={h} className="table-header">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {payroll.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-oe-muted text-sm">No payroll history</td></tr>
              ) : payroll.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="table-cell text-xs">{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td>
                  <td className="table-cell text-oe-success">{fmtCurrency(p.gross_salary)}</td>
                  <td className="table-cell text-oe-danger">-{fmtCurrency(p.total_deductions)}</td>
                  <td className="table-cell text-oe-primary font-medium">{fmtCurrency(p.net_salary)}</td>
                  <td className="table-cell">{p.leave_days_taken}</td>
                  <td className="table-cell"><span className={p.run_status === 'completed' ? 'badge-approved' : 'badge-pending'}>{p.run_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Salary Modal */}
      <Modal open={salaryModal} onClose={() => setSalaryModal(false)} title="Add Salary Structure" size="md">
        <div className="p-6 space-y-4">
          <div>
            <label className="label">Effective Date</label>
            <input type="date" className="input" value={salaryForm.effective_date} onChange={e => setSalaryForm({ ...salaryForm, effective_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SField name="basic_salary" label="Basic Salary *" />
            <SField name="housing_allowance" label="Housing Allowance" />
            <SField name="transport_allowance" label="Transport Allowance" />
            <SField name="meal_allowance" label="Meal Allowance" />
            <SField name="medical_allowance" label="Medical Allowance" />
            <SField name="mobile_allowance" label="Mobile Allowance" />
            <SField name="other_allowances" label="Other Allowances" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-2">Deductions</h4>
            <div className="grid grid-cols-2 gap-3">
              <SField name="tax_deduction" label="Tax" />
              <SField name="pension_deduction" label="Pension" />
              <SField name="health_insurance" label="Health Insurance" />
              <SField name="other_deductions" label="Other Deductions" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={salaryForm.notes} onChange={e => setSalaryForm({ ...salaryForm, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setSalaryModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSalary} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Salary'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );

  function SField({ name, label }) {
    return (
      <div>
        <label className="label">{label}</label>
        <input type="number" step="0.01" className="input" value={salaryForm[name] || ''} onChange={e => setSalaryForm({ ...salaryForm, [name]: e.target.value })} placeholder="0.00" />
      </div>
    );
  }
}
