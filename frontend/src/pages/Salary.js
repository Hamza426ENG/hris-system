import React, { useState, useEffect } from 'react';
import { salaryAPI, employeesAPI } from '../services/api';
import Modal from '../components/Modal';
import { Plus, Search, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { edgeLogoSvg } from '../components/EdgeLogo';

const fmtCurrency = (n) => n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '-';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-';

const downloadSalarySlip = (salary, employeeName) => {
  const name = employeeName || salary.employee_name || 'Employee';
  const now = new Date();
  const generatedOn = now.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
  const periodMonth = salary.effective_date
    ? new Date(salary.effective_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : generatedOn;

  const earnings = [
    ['Basic Salary',        salary.basic_salary],
    ['Housing Allowance',   salary.housing_allowance],
    ['Transport Allowance', salary.transport_allowance],
    ['Meal Allowance',      salary.meal_allowance],
    ['Medical Allowance',   salary.medical_allowance],
    ['Mobile Allowance',    salary.mobile_allowance],
    ['Other Allowances',    salary.other_allowances],
  ].filter(([, v]) => parseFloat(v) > 0);

  const deductions = [
    ['Income Tax',       salary.tax_deduction],
    ['Pension',          salary.pension_deduction],
    ['Health Insurance', salary.health_insurance],
    ['Other Deductions', salary.other_deductions],
  ].filter(([, v]) => parseFloat(v) > 0);

  const totalDeductions = deductions.reduce((s, [, v]) => s + parseFloat(v || 0), 0);

  // Build matching rows for the two-column table (pad shorter side with empty rows)
  const maxRows = Math.max(earnings.length, deductions.length);
  const earningsRows = [...earnings, ...Array(maxRows - earnings.length).fill(['', ''])];
  const deductionsRows = [...deductions, ...Array(maxRows - deductions.length).fill(['', ''])];

  const tableRows = earningsRows.map(([el, ev], i) => {
    const [dl, dv] = deductionsRows[i];
    return `<tr>
      <td class="item-label">${el}</td>
      <td class="item-val">${ev ? fmtCurrency(ev) : ''}</td>
      <td class="divider"></td>
      <td class="item-label deduct-label">${dl}</td>
      <td class="item-val deduct-val">${dv ? fmtCurrency(dv) : ''}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Salary Slip – ${name} – ${periodMonth}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:28px 32px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @media print{body{padding:0}@page{size:A4;margin:15mm 15mm 20mm 15mm}.no-print{display:none!important}}

  /* ── Company header ── */
  .co-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #7C3AED;padding-bottom:14px;margin-bottom:16px}
  .co-tagline{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:2px}
  .slip-badge{text-align:right}
  .slip-badge .title{font-size:15px;font-weight:700;color:#1e293b;letter-spacing:.02em}
  .slip-badge .period{font-size:11px;color:#64748b;margin-top:3px}

  /* ── Employee info grid ── */
  .emp-info{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #cbd5e1;margin-bottom:16px}
  .info-row{display:contents}
  .info-cell{padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:12px}
  .info-cell:nth-child(odd){border-right:1px solid #e2e8f0;background:#f8fafc}
  .info-cell .lbl{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:1px}
  .info-cell .val{font-weight:600;color:#1e293b}

  /* ── Earnings / Deductions two-column table ── */
  .pay-table{width:100%;border-collapse:collapse;border:1px solid #cbd5e1;margin-bottom:16px}
  .pay-table thead tr{background:#7C3AED;color:#fff}
  .pay-table thead th{padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em}
  .pay-table thead th.right{text-align:right}
  .pay-table .divider{width:1px;background:#cbd5e1;padding:0}
  .pay-table tbody tr:nth-child(even){background:#f8fafc}
  .pay-table tbody td{padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:12.5px}
  .item-label{color:#374151;width:34%}
  .item-val{text-align:right;font-weight:500;color:#1e293b;width:16%}
  .deduct-label{color:#374151;width:34%;padding-left:16px}
  .deduct-val{text-align:right;font-weight:500;color:#b91c1c;width:16%}
  .pay-table tfoot td{padding:8px 12px;font-size:12px;font-weight:700;border-top:2px solid #cbd5e1;background:#f1f5f9}
  .pay-table tfoot .total-earn{color:#059669}
  .pay-table tfoot .total-deduct{color:#b91c1c;padding-left:16px}

  /* ── Net salary bar ── */
  .net-bar{background:#7C3AED;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
  .net-bar .net-label{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
  .net-bar .net-amount{font-size:22px;font-weight:800;letter-spacing:-0.5px}

  /* ── Footer ── */
  .slip-footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0}
  .sig-block{text-align:center}
  .sig-line{width:160px;border-top:1px solid #94a3b8;margin:0 auto 4px}
  .sig-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
  .disclaimer{font-size:9.5px;color:#94a3b8;text-align:center;margin-top:14px}

  /* ── Print button ── */
  .no-print{display:flex;gap:10px;justify-content:center;margin-bottom:24px}
  .btn-print{padding:9px 28px;background:#1D6BE4;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
  .btn-close{padding:9px 20px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
</style>
</head><body>

<div class="no-print">
  <button class="btn-print" onclick="window.print()">&#x1F4BE; Save as PDF / Print</button>
  <button class="btn-close" onclick="window.close()">Close</button>
</div>

<!-- Company header -->
<div class="co-header">
  <div>
    ${edgeLogoSvg}
    <div class="co-tagline">Human Resource Information System</div>
  </div>
  <div class="slip-badge">
    <div class="title">SALARY SLIP</div>
    <div class="period">Pay Period: ${periodMonth}</div>
    <div class="period">Generated: ${generatedOn}</div>
  </div>
</div>

<!-- Employee info -->
<div class="emp-info">
  <div class="info-cell"><span class="lbl">Employee Name</span><span class="val">${name}</span></div>
  <div class="info-cell"><span class="lbl">Employee ID</span><span class="val">${salary.emp_code || '—'}</span></div>
  <div class="info-cell"><span class="lbl">Department</span><span class="val">${salary.department_name || '—'}</span></div>
  <div class="info-cell"><span class="lbl">Designation</span><span class="val">${salary.position_title || '—'}</span></div>
  <div class="info-cell"><span class="lbl">Pay Period</span><span class="val">${periodMonth}</span></div>
  <div class="info-cell"><span class="lbl">Employment Type</span><span class="val">${(salary.employment_type || 'Full Time').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span></div>
</div>

<!-- Earnings vs Deductions table -->
<table class="pay-table">
  <thead>
    <tr>
      <th colspan="2">Earnings</th>
      <th class="divider"></th>
      <th colspan="2" class="right">Deductions</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
  <tfoot>
    <tr>
      <td>Total Earnings</td>
      <td class="total-earn" style="text-align:right">${fmtCurrency(salary.gross_salary)}</td>
      <td class="divider"></td>
      <td class="total-deduct">Total Deductions</td>
      <td class="total-deduct" style="text-align:right">- ${fmtCurrency(totalDeductions)}</td>
    </tr>
  </tfoot>
</table>

<!-- Net salary -->
<div class="net-bar">
  <span class="net-label">Net Salary (Take Home)</span>
  <span class="net-amount">${fmtCurrency(salary.net_salary)}</span>
</div>

<!-- Signatures -->
<div class="slip-footer">
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-label">Employee Signature</div>
  </div>
  <div style="text-align:center;font-size:10px;color:#94a3b8">
    This is a system-generated salary slip and does not require a physical signature.
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-label">Authorized Signatory</div>
  </div>
</div>

<div class="disclaimer">
  This document is confidential and intended solely for the named employee. Unauthorized disclosure is prohibited.
</div>

</body></html>`;

  // Blob URL approach — works from synchronous button click, no popup blocker issues
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, '_blank');
  // Revoke after enough time for the window to load
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  // If popup was blocked, fall back to direct file download
  if (!newWin) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `salary-slip-${(employeeName || salary.employee_name || 'employee').replace(/\s+/g, '-')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};

export default function Salary() {
  const { user, permissions } = useAuth();
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
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    if (permissions.canManageAll) {
      salaryAPI.list().then(r => setSalaries(r.data)).catch(console.error).finally(() => setLoading(false));
    } else {
      // For team_lead/employee: fetch own salary via employee endpoint
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

  // Personal salary view for team_lead / employee
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
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-oe-text">My Salary</h2>
          {mySalary && (
            <button
              onClick={() => downloadSalarySlip(mySalary, `${user?.firstName} ${user?.lastName}`)}
              className="btn-secondary"
            >
              <Download size={15} /> Download Slip
            </button>
          )}
        </div>
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
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card"><div className="text-xl font-bold text-oe-text mb-1">{salaries.length}</div><div className="text-sm text-oe-muted">Active Salary Structures</div></div>
        <div className="stat-card"><div className="text-lg font-bold text-oe-success mb-1">{fmtCurrency(avgGross)}</div><div className="text-sm text-oe-muted">Average Gross</div></div>
        <div className="stat-card"><div className="text-lg font-bold text-oe-primary mb-1">{fmtCurrency(totalPayroll)}</div><div className="text-sm text-oe-muted">Monthly Gross Payroll</div></div>
        <div className="stat-card">
          <div className="text-lg font-bold text-oe-purple mb-1">{fmtCurrency(salaries.length ? Math.max(...salaries.map(s => parseFloat(s.gross_salary || 0))) : 0)}</div>
          <div className="text-sm text-oe-muted">Highest Salary</div>
        </div>
      </div>

      {/* Toolbar */}
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
                {['Employee', 'Department', 'Position', 'Basic', 'Allowances', 'Gross', 'Deductions', 'Net', 'Since', ''].map(h => (
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
                  <tr key={s.id} className="table-row cursor-pointer" onClick={() => navigate(`/employees/${s.employee_id}`)}>
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
                    <td className="table-cell">
                      <button
                        onClick={e => { e.stopPropagation(); downloadSalarySlip(s); }}
                        className="p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted hover:text-oe-primary transition-colors"
                        title="Download Salary Slip"
                      >
                        <Download size={14} />
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-oe-muted">No salary structures found</div>
        ) : filtered.map(s => {
          const allowances = (parseFloat(s.housing_allowance)||0) + (parseFloat(s.transport_allowance)||0) +
            (parseFloat(s.meal_allowance)||0) + (parseFloat(s.medical_allowance)||0) +
            (parseFloat(s.mobile_allowance)||0) + (parseFloat(s.other_allowances)||0);
          const deductions = (parseFloat(s.tax_deduction)||0) + (parseFloat(s.pension_deduction)||0) +
            (parseFloat(s.health_insurance)||0) + (parseFloat(s.other_deductions)||0);
          return (
            <div
              key={s.id}
              className="bg-white border border-oe-border rounded-xl p-4 cursor-pointer hover:border-oe-primary/30 transition-colors"
              onClick={() => navigate(`/employees/${s.employee_id}`)}
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
                <div className="bg-slate-50 rounded-lg p-2">
                  <div className="text-xs text-oe-muted mb-0.5">Gross</div>
                  <div className="text-sm font-semibold text-oe-success">{fmtCurrency(s.gross_salary)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <div className="text-xs text-oe-muted mb-0.5">Deductions</div>
                  <div className="text-sm font-semibold text-oe-danger">-{fmtCurrency(deductions)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
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
