import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { payrollAPI } from '@/services/api';
import Modal from '@/components/common/Modal';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Plus, Eye, CheckCircle, XCircle, Wallet, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const fmtCurrency = (n) => n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '$0';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function PayrollContent() {
  const { user } = useAuth();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ period_start: '', period_end: '', pay_date: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const load = () => {
    setLoading(true);
    payrollAPI.list().then(r => setRuns(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.period_start || !form.period_end || !form.pay_date) { alert('Fill all date fields'); return; }
    setSaving(true);
    try {
      const res = await payrollAPI.create(form);
      setModal(false);
      router.push(`/payroll/${res.data.id}`);
    } catch (err) { alert(err.response?.data?.error || 'Failed to create'); }
    finally { setSaving(false); }
  };

  const handleComplete = (id, e) => {
    e.stopPropagation();
    setConfirm({
      title: 'Complete Payroll Run',
      message: 'Mark this payroll run as completed? This action cannot be undone.',
      confirmLabel: 'Mark Complete',
      variant: 'success',
      onConfirm: async () => {
        setConfirming(true);
        try { await payrollAPI.complete(id); load(); }
        finally { setConfirming(false); setConfirm(null); }
      },
    });
  };

  const handleCancel = (id, e) => {
    e.stopPropagation();
    setConfirm({
      title: 'Cancel Payroll Run',
      message: 'Are you sure you want to cancel this payroll run? This action cannot be undone.',
      confirmLabel: 'Cancel Run',
      variant: 'danger',
      onConfirm: async () => {
        setConfirming(true);
        try { await payrollAPI.cancel(id); load(); }
        finally { setConfirming(false); setConfirm(null); }
      },
    });
  };

  const statusBadge = (s) => {
    const map = { draft: 'badge-pending', processing: 'badge-pending', completed: 'badge-approved', cancelled: 'badge-rejected' };
    return <span className={map[s] || 'badge-inactive'}>{s}</span>;
  };

  const totalCompleted = runs.filter(r => r.status === 'completed').reduce((a, b) => a + parseFloat(b.total_gross || 0), 0);

  const quickCreate = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const pay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setForm({
      period_start: start.toISOString().split('T')[0],
      period_end: end.toISOString().split('T')[0],
      pay_date: pay.toISOString().split('T')[0],
      description: `${MONTHS[now.getMonth()]} ${now.getFullYear()} Payroll`,
    });
    setModal(true);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card"><div className="text-2xl font-bold text-oe-text mb-1">{runs.length}</div><div className="text-sm text-oe-muted">Total Runs</div></div>
        <div className="stat-card"><div className="text-2xl font-bold text-oe-success mb-1">{runs.filter(r => r.status === 'completed').length}</div><div className="text-sm text-oe-muted">Completed</div></div>
        <div className="stat-card"><div className="text-2xl font-bold text-oe-warning mb-1">{runs.filter(r => r.status === 'draft' || r.status === 'processing').length}</div><div className="text-sm text-oe-muted">In Progress</div></div>
        <div className="stat-card"><div className="text-lg font-bold text-oe-primary mb-1">{fmtCurrency(totalCompleted)}</div><div className="text-sm text-oe-muted">Total Processed</div></div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 hidden sm:block" />
        {user?.role === 'super_admin' && (
          <button onClick={load} disabled={loading} className="btn-secondary justify-center sm:justify-start" title="Refresh data">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        )}
        <button onClick={quickCreate} className="btn-secondary justify-center sm:justify-start"><Wallet size={15} /> Quick Create (This Month)</button>
        <button onClick={() => setModal(true)} className="btn-primary justify-center sm:justify-start"><Plus size={15} /> New Payroll Run</button>
      </div>

      {/* Desktop table */}
      <div className="card p-0 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>
                {['Description', 'Period', 'Pay Date', 'Employees', 'Gross', 'Deductions', 'Net', 'Status', 'Actions'].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-oe-muted">
                  <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />Loading...
                </td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-oe-muted">No payroll runs. Create your first payroll run.</td></tr>
              ) : runs.map(r => (
                <tr key={r.id} className="table-row cursor-pointer" onClick={() => router.push(`/payroll/${r.id}`)}>
                  <td className="table-cell">
                    <div className="font-medium text-oe-text">{r.description || `${MONTHS[(r.month || 1) - 1]} ${r.year}`}</div>
                  </td>
                  <td className="table-cell text-xs text-oe-muted">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</td>
                  <td className="table-cell text-xs text-oe-muted">{fmtDate(r.pay_date)}</td>
                  <td className="table-cell text-center">{r.total_employees || '-'}</td>
                  <td className="table-cell text-oe-success">{r.total_gross ? fmtCurrency(r.total_gross) : '-'}</td>
                  <td className="table-cell text-oe-danger">{r.total_deductions ? `-${fmtCurrency(r.total_deductions)}` : '-'}</td>
                  <td className="table-cell text-oe-primary font-medium">{r.total_net ? fmtCurrency(r.total_net) : '-'}</td>
                  <td className="table-cell">{statusBadge(r.status)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={e => { e.stopPropagation(); router.push(`/payroll/${r.id}`); }} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-text transition-colors" data-tip="View">
                        <Eye size={14} />
                      </button>
                      {r.status === 'processing' && (
                        <button onClick={(e) => handleComplete(r.id, e)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-success transition-colors" data-tip="Complete">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {(r.status === 'draft' || r.status === 'processing') && (
                        <button onClick={(e) => handleCancel(r.id, e)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-danger transition-colors" data-tip="Cancel">
                          <XCircle size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-oe-muted">No payroll runs. Create your first payroll run.</div>
        ) : runs.map(r => (
          <div
            key={r.id}
            className="bg-white dark:bg-oe-card border border-oe-border rounded-xl p-4 cursor-pointer hover:border-oe-primary/30 transition-colors"
            onClick={() => router.push(`/payroll/${r.id}`)}
          >
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="font-medium text-oe-text text-sm">{r.description || `${MONTHS[(r.month || 1) - 1]} ${r.year}`}</div>
              {statusBadge(r.status)}
            </div>
            <div className="text-xs text-oe-muted mb-3">
              {fmtDate(r.period_start)} – {fmtDate(r.period_end)} · Pay: {fmtDate(r.pay_date)}
              {r.total_employees ? ` · ${r.total_employees} employees` : ''}
            </div>
            {(r.total_gross || r.total_net) && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 dark:bg-white/6 rounded-lg p-2">
                  <div className="text-xs text-oe-muted mb-0.5">Gross</div>
                  <div className="text-sm font-semibold text-oe-success">{r.total_gross ? fmtCurrency(r.total_gross) : '-'}</div>
                </div>
                <div className="bg-slate-50 dark:bg-white/6 rounded-lg p-2">
                  <div className="text-xs text-oe-muted mb-0.5">Deductions</div>
                  <div className="text-sm font-semibold text-oe-danger">{r.total_deductions ? `-${fmtCurrency(r.total_deductions)}` : '-'}</div>
                </div>
                <div className="bg-slate-50 dark:bg-white/6 rounded-lg p-2">
                  <div className="text-xs text-oe-muted mb-0.5">Net</div>
                  <div className="text-sm font-semibold text-oe-primary">{r.total_net ? fmtCurrency(r.total_net) : '-'}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

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

      {/* Create Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Create Payroll Run" size="sm">
        <div className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. July 2025 Payroll" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Period Start *</label>
              <input type="date" className="input" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} />
            </div>
            <div>
              <label className="label">Period End *</label>
              <input type="date" className="input" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Pay Date *</label>
            <input type="date" className="input" value={form.pay_date} onChange={e => setForm({ ...form, pay_date: e.target.value })} />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setModal(false)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary justify-center">
              {saving ? 'Creating...' : 'Create Run'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function PayrollPage() {
  return (
    <PrivateRoute>
      <Layout>
        <PayrollContent />
      </Layout>
    </PrivateRoute>
  );
}
