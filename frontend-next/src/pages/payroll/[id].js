import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { payrollAPI } from '@/services/api';
import { ArrowLeft, Play, CheckCircle, XCircle, Download } from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const fmtCurrency = (n) => n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '$0';

function PayrollDetailContent() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    setLoading(true);
    payrollAPI.get(id).then(r => setData(r.data)).catch(() => router.push('/payroll')).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!router.isReady) return;
    load();
  }, [id, router.isReady]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await payrollAPI.generate(id);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed to generate'); }
    finally { setGenerating(false); }
  };

  const handleComplete = async () => {
    if (!window.confirm('Mark payroll as completed? This cannot be undone.')) return;
    await payrollAPI.complete(id);
    load();
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this payroll run?')) return;
    await payrollAPI.cancel(id);
    load();
  };

  const printPayroll = () => {
    window.print();
  };

  if (!router.isReady || loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return null;

  const run = data;
  const items = data.items || [];

  const statusBadge = (s) => {
    const map = { draft: 'badge-pending', processing: 'badge-pending', completed: 'badge-approved', cancelled: 'badge-rejected' };
    return <span className={`${map[s] || 'badge-inactive'} text-sm px-3 py-1`}>{s}</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 no-print">
        <button onClick={() => router.push('/payroll')} className="flex items-center gap-2 text-oe-muted hover:text-oe-text transition-colors text-sm">
          <ArrowLeft size={16} /> Back to Payroll
        </button>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-oe-text">{run.description}</h2>
              {statusBadge(run.status)}
            </div>
            <div className="text-sm text-oe-muted">Period: {fmtDate(run.period_start)} – {fmtDate(run.period_end)} · Pay Date: {fmtDate(run.pay_date)}</div>
          </div>
          <div className="flex gap-2 no-print">
            {run.status === 'draft' && (
              <button onClick={handleGenerate} disabled={generating} className="btn-primary">
                <Play size={15} /> {generating ? 'Generating...' : 'Generate Payroll'}
              </button>
            )}
            {run.status === 'processing' && (
              <button onClick={handleComplete} className="btn-success"><CheckCircle size={15} /> Complete</button>
            )}
            {(run.status === 'draft' || run.status === 'processing') && (
              <button onClick={handleCancel} className="btn-danger"><XCircle size={15} /> Cancel</button>
            )}
            <button onClick={printPayroll} className="btn-secondary no-print"><Download size={15} /> Print / Export</button>
          </div>
        </div>
      </div>

      {run.total_employees > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="stat-card"><div className="text-xl font-bold text-oe-text mb-1">{run.total_employees}</div><div className="text-sm text-oe-muted">Employees</div></div>
          <div className="stat-card"><div className="text-xl font-bold text-oe-success mb-1">{fmtCurrency(run.total_gross)}</div><div className="text-sm text-oe-muted">Total Gross</div></div>
          <div className="stat-card"><div className="text-xl font-bold text-oe-danger mb-1">-{fmtCurrency(run.total_deductions)}</div><div className="text-sm text-oe-muted">Total Deductions</div></div>
          <div className="stat-card"><div className="text-xl font-bold text-oe-primary mb-1">{fmtCurrency(run.total_net)}</div><div className="text-sm text-oe-muted">Net Payroll</div></div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-oe-border">
          <span className="font-semibold text-oe-text text-sm">{items.length} Employee Payslips</span>
        </div>
        {items.length === 0 ? (
          <div className="py-12 text-center text-oe-muted">
            <div className="text-sm mb-2">No payroll items generated yet.</div>
            {run.status === 'draft' && (
              <button onClick={handleGenerate} disabled={generating} className="btn-primary mx-auto">
                <Play size={15} /> {generating ? 'Generating...' : 'Generate Payroll Items'}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-oe-surface/50">
                <tr>
                  {['Employee', 'Department', 'Basic', 'Allowances', 'Gross', 'Deductions', 'Net', 'Leave Days'].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white">
                          {item.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-oe-text">{item.employee_name}</div>
                          <div className="text-xs text-oe-muted">{item.emp_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-xs text-oe-muted">{item.department_name}</td>
                    <td className="table-cell">{fmtCurrency(item.basic_salary)}</td>
                    <td className="table-cell text-oe-muted">{fmtCurrency(
                      (parseFloat(item.housing_allowance) || 0) + (parseFloat(item.transport_allowance) || 0) +
                      (parseFloat(item.meal_allowance) || 0) + (parseFloat(item.medical_allowance) || 0) +
                      (parseFloat(item.mobile_allowance) || 0) + (parseFloat(item.other_allowances) || 0)
                    )}</td>
                    <td className="table-cell text-oe-success font-medium">{fmtCurrency(item.gross_salary)}</td>
                    <td className="table-cell text-oe-danger">-{fmtCurrency(item.total_deductions)}</td>
                    <td className="table-cell text-oe-primary font-semibold">{fmtCurrency(item.net_salary)}</td>
                    <td className="table-cell text-center">{item.leave_days_taken || 0}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-oe-surface/50">
                <tr>
                  <td className="table-cell font-semibold text-oe-text" colSpan={4}>Total</td>
                  <td className="table-cell text-oe-success font-bold">{fmtCurrency(run.total_gross)}</td>
                  <td className="table-cell text-oe-danger font-bold">-{fmtCurrency(run.total_deductions)}</td>
                  <td className="table-cell text-oe-primary font-bold">{fmtCurrency(run.total_net)}</td>
                  <td className="table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PayrollDetailPage() {
  return (
    <PrivateRoute>
      <Layout>
        <PayrollDetailContent />
      </Layout>
    </PrivateRoute>
  );
}
