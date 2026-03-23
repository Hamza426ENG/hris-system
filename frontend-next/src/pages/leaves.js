import React, { useState, useEffect, useCallback } from 'react';
import { leavesAPI, employeesAPI } from '@/services/api';
import Modal from '@/components/common/Modal';
import { Plus, Check, X, Calendar, Download } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

function LeavesContent() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [types, setTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', year: new Date().getFullYear() });
  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);
  const canApprove = ['super_admin', 'hr_admin', 'team_lead'].includes(user?.role);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [form, setForm] = useState({ employee_id: isHR ? '' : (user?.employeeId || ''), leave_type_id: '', start_date: '', end_date: '', reason: '', half_day: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leavesAPI.list(filters);
      setLeaves(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    leavesAPI.types().then(r => setTypes(r.data));
    if (canApprove) employeesAPI.list({ status: 'active' }).then(r => setEmployees(r.data.data));
  }, [canApprove]);

  const handleApprove = async () => {
    await leavesAPI.approve(selected.id, { review_comments: reviewComment });
    setModal(null); setSelected(null); setReviewComment(''); load();
  };
  const handleReject = async () => {
    if (!reviewComment) { alert('Please provide rejection reason'); return; }
    await leavesAPI.reject(selected.id, { review_comments: reviewComment });
    setModal(null); setSelected(null); setReviewComment(''); load();
  };
  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this leave request?')) return;
    await leavesAPI.cancel(id); load();
  };

  const handleSubmit = async () => {
    const employeeId = isHR ? form.employee_id : (form.employee_id || user?.employeeId || '');
    const submitForm = { ...form, employee_id: employeeId };
    if (!submitForm.employee_id || !submitForm.leave_type_id || !submitForm.start_date || !submitForm.end_date || !submitForm.reason) {
      alert('Please fill all required fields'); return;
    }
    setSaving(true);
    try {
      await leavesAPI.create(submitForm);
      setModal(null);
      setForm({ employee_id: isHR ? '' : (user?.employeeId || ''), leave_type_id: '', start_date: '', end_date: '', reason: '', half_day: false });
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed to submit'); }
    finally { setSaving(false); }
  };

  const exportCSV = () => {
    const headers = ['Employee', 'Type', 'Start', 'End', 'Days', 'Status', 'Reason'];
    const rows = leaves.map(l => [l.employee_name, l.leave_type_name, fmtDate(l.start_date), fmtDate(l.end_date), l.total_days, l.status, l.reason]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `leaves_${filters.year}.csv`; a.click();
  };

  const pending = leaves.filter(l => l.status === 'pending');
  const approved = leaves.filter(l => l.status === 'approved');

  const statusBadge = (s) => {
    const map = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', cancelled: 'badge-inactive', withdrawn: 'badge-inactive' };
    return <span className={map[s] || 'badge-inactive'}>{s}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Requests', value: leaves.length, color: 'primary' },
          { label: 'Pending', value: pending.length, color: 'warning' },
          { label: 'Approved', value: approved.length, color: 'success' },
          { label: 'Rejected', value: leaves.filter(l => l.status === 'rejected').length, color: 'danger' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`text-2xl font-bold mb-1 ${s.color === 'warning' ? 'text-oe-warning' : s.color === 'success' ? 'text-oe-success' : s.color === 'danger' ? 'text-oe-danger' : 'text-oe-primary'}`}>{s.value}</div>
            <div className="text-sm text-oe-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          <select className="input w-full sm:w-36" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input w-full sm:w-28" value={filters.year} onChange={e => setFilters({ ...filters, year: e.target.value })}>
            {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportCSV} className="btn-secondary flex-1 sm:flex-none justify-center"><Download size={15} /> Export</button>
        </div>
        <button onClick={() => setModal('request')} className="btn-primary sm:ml-auto justify-center"><Plus size={15} /> Request Leave</button>
      </div>

      {/* Pending section for approvers */}
      {canApprove && pending.length > 0 && (
        <div className="card border-oe-warning/30">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={15} className="text-oe-warning" />
            <h3 className="font-semibold text-oe-text text-sm">{pending.length} Pending Approval{pending.length !== 1 ? 's' : ''}</h3>
          </div>
          <div className="space-y-2">
            {pending.slice(0, 5).map(l => (
              <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-oe-border/30 last:border-0 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {l.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-oe-text">{l.employee_name}</span>
                    <span className="text-xs text-oe-muted ml-2">{l.leave_type_name} · {l.total_days}d · {fmtDate(l.start_date)}</span>
                  </div>
                </div>
                <div className="flex gap-2 pl-10 sm:pl-0">
                  <button onClick={() => { setSelected(l); setModal('review'); }} className="btn-success py-1 px-2.5 text-xs"><Check size={12} /> Review</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="card p-0 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>
                {['Employee', 'Leave Type', 'Duration', 'Days', 'Reason', 'Status', 'Reviewed By', 'Actions'].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-oe-muted">
                  <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading...
                </td></tr>
              ) : leaves.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-oe-muted">No leave requests found</td></tr>
              ) : leaves.map(l => (
                <tr key={l.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {l.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-oe-text">{l.employee_name}</div>
                        <div className="text-xs text-oe-muted">{l.department_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                      <span className="text-sm">{l.leave_type_name}</span>
                    </div>
                  </td>
                  <td className="table-cell text-xs text-oe-muted">{fmtDate(l.start_date)} – {fmtDate(l.end_date)}</td>
                  <td className="table-cell text-center">{l.total_days}</td>
                  <td className="table-cell text-oe-muted text-xs max-w-32 truncate" title={l.reason}>{l.reason}</td>
                  <td className="table-cell">{statusBadge(l.status)}</td>
                  <td className="table-cell text-xs text-oe-muted">{l.reviewer_name || '-'}</td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      {canApprove && l.status === 'pending' && (
                        <>
                          <button onClick={() => { setSelected(l); setModal('review'); }} className="p-1.5 rounded hover:bg-oe-surface text-oe-muted hover:text-oe-success transition-colors" title="Review"><Check size={13} /></button>
                          <button onClick={() => { setSelected(l); setModal('reject'); }} className="p-1.5 rounded hover:bg-oe-surface text-oe-muted hover:text-oe-danger transition-colors" title="Reject"><X size={13} /></button>
                        </>
                      )}
                      {l.status === 'pending' && (
                        <button onClick={() => handleCancel(l.id)} className="p-1.5 rounded hover:bg-oe-surface text-oe-muted hover:text-oe-warning transition-colors text-xs" title="Cancel">Cancel</button>
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
        ) : leaves.length === 0 ? (
          <div className="text-center py-12 text-oe-muted">No leave requests found</div>
        ) : leaves.map(l => (
          <div key={l.id} className="bg-white dark:bg-oe-card border border-oe-border rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {l.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-oe-text truncate">{l.employee_name}</div>
                  <div className="text-xs text-oe-muted truncate">{l.department_name}</div>
                </div>
              </div>
              {statusBadge(l.status)}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
              <span className="text-sm font-medium text-oe-text">{l.leave_type_name}</span>
              <span className="text-xs text-oe-muted ml-auto">{l.total_days} day{l.total_days !== 1 ? 's' : ''}</span>
            </div>
            <div className="text-xs text-oe-muted">
              {fmtDate(l.start_date)} – {fmtDate(l.end_date)}
            </div>
            {l.reason && (
              <div className="text-xs text-oe-muted line-clamp-2">{l.reason}</div>
            )}
            {(canApprove && l.status === 'pending') || l.status === 'pending' ? (
              <div className="flex gap-2 pt-1">
                {canApprove && l.status === 'pending' && (
                  <>
                    <button onClick={() => { setSelected(l); setModal('review'); }} className="btn-success py-1.5 px-3 text-xs flex-1 justify-center"><Check size={12} /> Approve</button>
                    <button onClick={() => { setSelected(l); setModal('reject'); }} className="btn-danger py-1.5 px-3 text-xs flex-1 justify-center"><X size={12} /> Reject</button>
                  </>
                )}
                {l.status === 'pending' && !canApprove && (
                  <button onClick={() => handleCancel(l.id)} className="btn-secondary py-1.5 px-3 text-xs justify-center w-full">Cancel Request</button>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Request Modal */}
      <Modal open={modal === 'request'} onClose={() => setModal(null)} title="Request Leave" size="md">
        <div className="p-4 sm:p-6 space-y-4">
          {isHR && (
            <div>
              <label className="label">Employee *</label>
              <select className="input" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Select employee...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_id})</option>)}
              </select>
            </div>
          )}
          {canApprove && !isHR && (
            <div>
              <label className="label">Employee *</label>
              <select className="input" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Select employee...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_id})</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Leave Type *</label>
            <select className="input" value={form.leave_type_id} onChange={e => setForm({ ...form, leave_type_id: e.target.value })}>
              <option value="">Select type...</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name} ({t.days_allowed}d allowed)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date *</label>
              <input type="date" className="input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className="label">End Date *</label>
              <input type="date" className="input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="half_day" className="rounded" checked={form.half_day} onChange={e => setForm({ ...form, half_day: e.target.checked })} />
            <label htmlFor="half_day" className="text-sm text-oe-muted">Half day leave</label>
          </div>
          <div>
            <label className="label">Reason *</label>
            <textarea className="input" rows={3} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Provide a reason for your leave request..." />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setModal(null)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="btn-primary justify-center">
              {saving ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal open={modal === 'review'} onClose={() => { setModal(null); setSelected(null); setReviewComment(''); }} title="Review Leave Request" size="md">
        {selected && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="bg-oe-surface rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-oe-muted">Employee</span><span className="text-oe-text font-medium">{selected.employee_name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-oe-muted">Leave Type</span><span className="text-oe-text">{selected.leave_type_name}</span></div>
              <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-1"><span className="text-oe-muted">Duration</span><span className="text-oe-text">{fmtDate(selected.start_date)} – {fmtDate(selected.end_date)} ({selected.total_days} days)</span></div>
              <div className="flex justify-between text-sm"><span className="text-oe-muted">Reason</span><span className="text-oe-text max-w-48 text-right">{selected.reason}</span></div>
            </div>
            <div>
              <label className="label">Comments (optional for approval, required for rejection)</label>
              <textarea className="input" rows={3} value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="Add review comments..." />
            </div>
            <div className="flex gap-3">
              <button onClick={handleReject} className="btn-danger flex-1 justify-center"><X size={15} /> Reject</button>
              <button onClick={handleApprove} className="btn-success flex-1 justify-center"><Check size={15} /> Approve</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function LeavesPage() {
  return (
    <PrivateRoute>
      <Layout>
        <LeavesContent />
      </Layout>
    </PrivateRoute>
  );
}
