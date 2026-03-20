import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { salaryAPI, employeesAPI } from '../services/api';
import Modal from '../components/Modal';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PrivateRoute from '../components/PrivateRoute';
import Layout from '../components/Layout';

const fmtCurrency = (n) => n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '-';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-';

function SalaryContent() {
  const { user, permissions } = useAuth();
  const router = useRouter();
  const [salaries, setSalaries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', basic_salary: '', housing_allowance: '', transport_allowance: '',
    meal_allowance: '', medical_allowance: '', mobile_allowance: '', other_allowances: '',
    tax_deduction: '', pension_deduction: '', health_insurance: '', other_deductions: '',
    effective_date: new Date().toISOString().split('T')[0], notes: '',
  });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    if (permissions.canManageAll) {
      salaryAPI.list().then(r => setSalaries(r.data)).catch(console.error).finally(() => setLoading(false));
    } else {
      if (user?.employeeId) {
        employeesAPI.getSalary(user.employeeId).then(r => setSalaries(r.data)).catch(console.error).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    load();
    if (permissions.canManageAll) {
      employeesAPI.list({ status: 'active' }).then(r => setEmployees(r.data.data)).catch(console.error);
    }
  }, [permissions.canManageAll]);

  const handleSave = async () => {
    if (!form.employee_id || !form.basic_salary) { alert('Employee and basic salary required'); return; }
    setSaving(true);
    try {
      await salaryAPI.create(form);
      setModal(false);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const filtered = salaries.filter(s =>
    s.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.emp_code?.toLowerCase().includes(search.toLowerCase()) ||
    s.department_name?.toLowerCase().includes(search.toLowerCase())
  );

  const avgGross = salaries.length ? salaries.reduce((a, b) => a + parseFloat(b.gross_salary || 0), 0) / salaries.length : 0;
  const totalPayroll = salaries.reduce((a, b) => a + parseFloat(b.gross_salary || 0), 0);

  const Field = ({ label, name }) => (
    <div>
      <label className="label">{label}</label>
      <input type="number" step="0.01" min="0" className="input" value={form[name] || ''} onChange={e => setForm({ ...form, [name]: e.target.value })} placeholder="0.00" />
    </div>
  );

  // Personal salary view
  if (!permissions.canManageAll) {
    const mySalary = salaries[0];
    const earnings = mySalary ? [
      { label: 'Basic Salary', value: mySalary.basic_salary },
      { label: 'Housing Allowance', value: mySalary.housing_allowance },
      { label: 'Transport Allowance', value: mySalary.transport_allowance },
      { label: 'Meal Allowance', value: mySalary.meal_allowance },
      { label: 'Medical Allowance', value: mySalary.medical_allowance },
      { label: 'Mobile Allowance', value: mySalary.mobile_allowance },
      { label: 'Other Allowances', value: mySalary.other_allowances },
    ].filter(e => parseFloat(e.value) > 0) : [];
    const deductions = mySalary ? [
      { label: 'Tax', value: mySalary.tax_deduction },
      { label: 'Pension', value: mySalary.pension_deduction },
      { label: 'Health Insurance', value: mySalary.health_insurance },
      { label: 'Other Deductions', value: mySalary.other_deductions },
    ].filter(d => parseFloat(d.value) > 0) : [];

    return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-oe-text">My Salary</h2>
        {loading ? (
          <div className="text-center py-12 text-oe-muted">
            <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : !mySalary ? (
          <div className="card text-center py-12 text-oe-muted">No salary structure found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="card space-y-3">
              <h3 className="font-semibold text-oe-text text-sm">Earnings</h3>
              {earnings.map(e => (
                <div key={e.label} className="flex justify-between text-sm">
                  <span className="text-oe-muted">{e.label}</span>
                  <span className="font-medium text-oe-text">{fmtCurrency(e.value)}</span>
                </div>
              ))}
              <div className="border-t border-oe-border pt-2 flex justify-between text-sm font-semibold">
                <span className="text-oe-text">Gross Salary</span>
                <span className="text-oe-success">{fmtCurrency(mySalary.gross_salary)}</span>
              </div>
            </div>
            <div className="card space-y-3">
              <h3 className="font-semibold text-oe-text text-sm">Deductions</h3>
              {deductions.map(d => (
                <div key={d.label} className="flex justify-between text-sm">
                  <span className="text-oe-muted">{d.label}</span>
                  <span className="font-medium text-oe-danger">-{fmtCurrency(d.value)}</span>
                </div>
              ))}
              <div className="border-t border-oe-border pt-2 flex justify-between text-sm font-semibold">
                <span className="text-oe-text">Net Salary</span>
                <span className="text-oe-primary">{fmtCurrency(mySalary.net_salary)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card"><div className="text-xl font-bold text-oe-text mb-1">{salaries.length}</div><div className="text-sm text-oe-muted">Active Salary Structures</div></div>
        <div className="stat-card"><div className="text-lg font-bold text-oe-success mb-1">{fmtCurrency(avgGross)}</div><div className="text-sm text-oe-muted">Average Gross</div></div>
        <div className="stat-card"><div className="text-lg font-bold text-oe-primary mb-1">{fmtCurrency(totalPayroll)}</div><div className="text-sm text-oe-muted">Monthly Gross Payroll</div></div>
        <div className="stat-card">
          <div className="text-lg font-bold text-oe-purple mb-1">{fmtCurrency(salaries.length ? Math.max(...salaries.map(s => parseFloat(s.gross_salary || 0))) : 0)}</div>
          <div className="text-sm text-oe-muted">Highest Salary</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
          <input className="input pl-9" placeholder="Search by name, ID, department..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setModal(true)} className="btn-primary justify-center sm:justify-start"><Plus size={15} /> Add Salary Structure</button>
      </div>

      {/* Desktop table */}
      <div className="card p-0 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>
                {['Employee', 'Department', 'Position', 'Basic', 'Allowances', 'Gross', 'Deductions', 'Net', 'Since'].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-oe-muted">
                  <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />Loading...
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-oe-muted">No salary structures found</td></tr>
              ) : filtered.map(s => {
                const allowances = (parseFloat(s.housing_allowance)||0) + (parseFloat(s.transport_allowance)||0) +
                  (parseFloat(s.meal_allowance)||0) + (parseFloat(s.medical_allowance)||0) +
                  (parseFloat(s.mobile_allowance)||0) + (parseFloat(s.other_allowances)||0);
                const deductions = (parseFloat(s.tax_deduction)||0) + (parseFloat(s.pension_deduction)||0) +
                  (parseFloat(s.health_insurance)||0) + (parseFloat(s.other_deductions)||0);
                return (
                  <tr key={s.id} className="table-row cursor-pointer" onClick={() => router.push(`/employees/${s.employee_id}`)}>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white">
                          {s.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-oe-text">{s.employee_name}</div>
                          <div className="text-xs text-oe-muted">{s.emp_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-xs text-oe-muted">{s.department_name}</td>
                    <td className="table-cell text-xs text-oe-muted">{s.position_title}</td>
                    <td className="table-cell">{fmtCurrency(s.basic_salary)}</td>
                    <td className="table-cell text-oe-muted">{fmtCurrency(allowances)}</td>
                    <td className="table-cell text-oe-success font-medium">{fmtCurrency(s.gross_salary)}</td>
                    <td className="table-cell text-oe-danger">-{fmtCurrency(deductions)}</td>
                    <td className="table-cell text-oe-primary font-semibold">{fmtCurrency(s.net_salary)}</td>
                    <td className="table-cell text-xs text-oe-muted">{fmtDate(s.effective_date)}</td>
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-oe-muted">No salary structures found</div>
        ) : filtered.map(s => {
          const deductions = (parseFloat(s.tax_deduction)||0) + (parseFloat(s.pension_deduction)||0) +
            (parseFloat(s.health_insurance)||0) + (parseFloat(s.other_deductions)||0);
          return (
            <div
              key={s.id}
              className="bg-white dark:bg-oe-card border border-oe-border rounded-xl p-4 cursor-pointer hover:border-oe-primary/30 transition-colors"
              onClick={() => router.push(`/employees/${s.employee_id}`)}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {s.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-oe-text truncate">{s.employee_name}</div>
                  <div className="text-xs text-oe-muted">{s.emp_code} · {s.department_name}</div>
                </div>
                <div className="text-xs text-oe-muted flex-shrink-0">{fmtDate(s.effective_date)}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 dark:bg-white/6 rounded-lg p-2">
                  <div className="text-xs text-oe-muted mb-0.5">Gross</div>
                  <div className="text-sm font-semibold text-oe-success">{fmtCurrency(s.gross_salary)}</div>
                </div>
                <div className="bg-slate-50 dark:bg-white/6 rounded-lg p-2">
                  <div className="text-xs text-oe-muted mb-0.5">Deductions</div>
                  <div className="text-sm font-semibold text-oe-danger">-{fmtCurrency(deductions)}</div>
                </div>
                <div className="bg-slate-50 dark:bg-white/6 rounded-lg p-2">
                  <div className="text-xs text-oe-muted mb-0.5">Net</div>
                  <div className="text-sm font-semibold text-oe-primary">{fmtCurrency(s.net_salary)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Add Salary Structure" size="md">
        <div className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="label">Employee *</label>
            <select className="input" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Select employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_id})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Effective Date *</label>
              <input type="date" className="input" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency || 'USD'} onChange={e => setForm({ ...form, currency: e.target.value })}>
                {['USD', 'EUR', 'GBP', 'AED', 'SAR', 'PKR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-2">Earnings</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Basic Salary *" name="basic_salary" />
              <Field label="Housing Allowance" name="housing_allowance" />
              <Field label="Transport Allowance" name="transport_allowance" />
              <Field label="Meal Allowance" name="meal_allowance" />
              <Field label="Medical Allowance" name="medical_allowance" />
              <Field label="Mobile Allowance" name="mobile_allowance" />
              <Field label="Other Allowances" name="other_allowances" />
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-2">Deductions</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tax" name="tax_deduction" />
              <Field label="Pension" name="pension_deduction" />
              <Field label="Health Insurance" name="health_insurance" />
              <Field label="Other Deductions" name="other_deductions" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setModal(false)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary justify-center">
              {saving ? 'Saving...' : 'Save Salary Structure'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function SalaryPage() {
  return (
    <PrivateRoute>
      <Layout>
        <SalaryContent />
      </Layout>
    </PrivateRoute>
  );
}
