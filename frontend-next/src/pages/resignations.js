import React, { useState, useEffect, useCallback } from 'react';
import { resignationsAPI, employeesAPI } from '@/services/api';
import Layout from '@/components/layout/Layout';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Modal from '@/components/common/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  LogOut, Plus, Search, CheckCircle2, XCircle, Clock, AlertTriangle,
  User, Calendar, Building, ChevronRight, X, Check, RefreshCw,
  FileText, Shield, Monitor, DollarSign, Users, ClipboardCheck
} from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-700',  icon: Clock },
  approved:  { label: 'Approved',  cls: 'bg-blue-100 text-blue-700',      icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-700',        icon: XCircle },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700',    icon: CheckCircle2 },
  withdrawn: { label: 'Withdrawn', cls: 'bg-gray-100 text-gray-500',      icon: X },
};

const REASONS = [
  'Better opportunity', 'Personal reasons', 'Relocation', 'Higher studies',
  'Health issues', 'Family responsibilities', 'Retirement', 'Contract end', 'Other',
];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.cls}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

function ClearanceItem({ label, checked, icon: Icon, iconColor }) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg ${checked ? 'bg-green-50' : 'bg-gray-50'}`}>
      <Icon size={14} className={checked ? 'text-green-600' : 'text-gray-400'} />
      <span className={`text-xs font-medium ${checked ? 'text-green-700' : 'text-gray-500'}`}>{label}</span>
      {checked ? <Check size={12} className="ml-auto text-green-600" /> : <Clock size={12} className="ml-auto text-gray-400" />}
    </div>
  );
}

function ResignationDetailModal({ resignation, onClose, onApprove, onReject, onComplete, onWithdraw, isAdmin }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const r = resignation;

  const clearanceItems = [
    { key: 'clearance_finance',    label: 'Finance',    icon: DollarSign,    color: 'text-green-600' },
    { key: 'clearance_it',         label: 'IT',         icon: Monitor,       color: 'text-blue-600' },
    { key: 'clearance_hr',         label: 'HR',         icon: Users,         color: 'text-purple-600' },
    { key: 'clearance_operations', label: 'Operations', icon: ClipboardCheck,color: 'text-orange-600' },
    { key: 'clearance_admin',      label: 'Admin',      icon: Shield,        color: 'text-gray-600' },
  ];

  return (
    <Modal open onClose={onClose} title="Resignation Details" size="md">
      <div className="p-5 space-y-5">
        {/* Employee */}
        <div className="flex items-center gap-3 p-3 bg-oe-surface rounded-xl">
          <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {r.first_name?.[0]}{r.last_name?.[0]}
          </div>
          <div>
            <div className="font-semibold text-oe-text">{r.first_name} {r.last_name}</div>
            <div className="text-xs text-oe-muted">{r.emp_code} · {r.department_name || '—'} · {r.position_title || '—'}</div>
          </div>
          <div className="ml-auto"><StatusBadge status={r.status} /></div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ['Resignation Date', fmtDate(r.resignation_date)],
            ['Last Working Day', fmtDate(r.last_working_day)],
            ['Notice Period', `${r.notice_period_days} days`],
            ['Hire Date', fmtDate(r.hire_date)],
            ['Employment Duration', r.employment_duration || '—'],
            ['Settlement Amount', r.final_settlement_amount ? `$${Number(r.final_settlement_amount).toLocaleString()}` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="p-2.5 rounded-lg bg-oe-surface/60 border border-oe-border/30">
              <div className="text-[10px] text-oe-muted uppercase tracking-wide font-medium">{label}</div>
              <div className="text-sm font-semibold text-oe-text mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {/* Reason */}
        {(r.reason || r.reason_details) && (
          <div className="p-3 bg-oe-surface/60 rounded-lg border border-oe-border/30">
            <div className="text-[11px] text-oe-muted uppercase tracking-wide font-semibold mb-1">Reason for Leaving</div>
            {r.reason && <div className="text-sm font-medium text-oe-text">{r.reason}</div>}
            {r.reason_details && <div className="text-xs text-oe-muted mt-1">{r.reason_details}</div>}
          </div>
        )}

        {/* Clearance */}
        <div>
          <div className="text-xs font-semibold text-oe-muted uppercase tracking-wide mb-2">Clearance Status</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {clearanceItems.map(c => (
              <ClearanceItem key={c.key} label={c.label} checked={!!r[c.key]} icon={c.icon} iconColor={c.color} />
            ))}
            <ClearanceItem label="Equipment" checked={!!r.equipment_returned} icon={Monitor} iconColor="text-gray-600" />
          </div>
        </div>

        {/* Exit Interview */}
        {r.exit_interview_scheduled && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-xs font-semibold text-blue-700 mb-1">Exit Interview</div>
            {r.exit_interview_date && <div className="text-sm text-blue-800">{fmtDate(r.exit_interview_date)}</div>}
            {r.exit_interview_notes && <div className="text-xs text-blue-600 mt-1">{r.exit_interview_notes}</div>}
          </div>
        )}

        {/* Rejection reason */}
        {r.status === 'rejected' && r.rejection_reason && (
          <div className="p-3 bg-red-50 rounded-lg border border-red-100">
            <div className="text-xs font-semibold text-red-700 mb-1">Rejection Reason</div>
            <div className="text-sm text-red-800">{r.rejection_reason}</div>
          </div>
        )}

        {/* Actions */}
        {isAdmin && (
          <div className="border-t border-oe-border/40 pt-4 flex flex-wrap gap-2 justify-end">
            {r.status === 'pending' && (
              <>
                <button onClick={() => setShowRejectInput(v => !v)} className="btn-secondary text-sm text-oe-danger border-oe-danger/30 hover:bg-oe-danger/5">
                  <XCircle size={13} /> Reject
                </button>
                <button onClick={onApprove} className="btn-primary text-sm">
                  <CheckCircle2 size={13} /> Approve
                </button>
              </>
            )}
            {r.status === 'approved' && (
              <button onClick={onComplete} className="btn-primary text-sm bg-green-600 hover:bg-green-700">
                <CheckCircle2 size={13} /> Mark Complete
              </button>
            )}
            {r.status === 'pending' && (
              <button onClick={onWithdraw} className="btn-secondary text-sm">
                <RefreshCw size={13} /> Withdraw
              </button>
            )}
          </div>
        )}
        {showRejectInput && (
          <div className="space-y-2">
            <textarea className="input text-sm" rows={2} placeholder="Rejection reason (optional)..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRejectInput(false)} className="btn-secondary text-xs">Cancel</button>
              <button onClick={() => { onReject(rejectReason); setShowRejectInput(false); }} className="btn-primary text-xs bg-red-600 hover:bg-red-700">Confirm Reject</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CreateResignationModal({ onClose, onCreated }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    employee_id: '', resignation_date: '', notice_period_days: 30,
    reason: '', reason_details: '', final_settlement_amount: '',
    exit_interview_scheduled: false, exit_interview_date: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    employeesAPI.list({ status: 'active', limit: 200 }).then(r => setEmployees(r.data?.data || [])).catch(console.error);
  }, []);

  const handleSubmit = async () => {
    if (!form.employee_id || !form.resignation_date) { alert('Employee and resignation date are required'); return; }
    setSaving(true);
    try {
      await resignationsAPI.create(form);
      onCreated();
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create resignation');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Create Resignation" size="md">
      <div className="p-5 space-y-4">
        <div>
          <label className="label">Employee *</label>
          <select className="input" value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}>
            <option value="">Select employee...</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_id})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Resignation Date *</label>
            <input type="date" className="input" value={form.resignation_date} onChange={e => setForm({...form, resignation_date: e.target.value})} />
          </div>
          <div>
            <label className="label">Notice Period (days)</label>
            <input type="number" className="input" value={form.notice_period_days} onChange={e => setForm({...form, notice_period_days: parseInt(e.target.value) || 30})} />
          </div>
        </div>
        <div>
          <label className="label">Reason</label>
          <select className="input" value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}>
            <option value="">Select reason...</option>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Details</label>
          <textarea className="input" rows={2} placeholder="Additional details..." value={form.reason_details} onChange={e => setForm({...form, reason_details: e.target.value})} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Final Settlement (optional)</label>
            <input type="number" className="input" placeholder="0.00" value={form.final_settlement_amount} onChange={e => setForm({...form, final_settlement_amount: e.target.value})} />
          </div>
          <div>
            <label className="label">Exit Interview Date</label>
            <input type="date" className="input" value={form.exit_interview_date} onChange={e => setForm({...form, exit_interview_date: e.target.value, exit_interview_scheduled: !!e.target.value})} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary">
            {saving ? 'Creating...' : <><Plus size={13}/> Create</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResignationsContent() {
  const { user, permissions } = useAuth();
  const isAdmin = permissions?.canManageAll;

  const [resignations, setResignations] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [createModal, setCreateModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    resignationsAPI.list({ status: statusFilter || undefined, page, limit: 20 })
      .then(r => { setResignations(r.data?.data || []); setTotal(r.data?.total || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async () => {
    try { await resignationsAPI.approve(selected.id); setSelected(null); load(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to approve'); }
  };

  const handleReject = async (reason) => {
    try { await resignationsAPI.reject(selected.id, { rejection_reason: reason }); setSelected(null); load(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to reject'); }
  };

  const handleComplete = async () => {
    if (!confirm('Mark this resignation as complete? This will set the employee status to Terminated.')) return;
    try { await resignationsAPI.complete(selected.id); setSelected(null); load(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to complete'); }
  };

  const handleWithdraw = async () => {
    if (!confirm('Withdraw this resignation?')) return;
    try { await resignationsAPI.withdraw(selected.id); setSelected(null); load(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to withdraw'); }
  };

  const openDetail = async (r) => {
    try {
      const res = await resignationsAPI.get(r.id);
      setSelected(res.data?.data || r);
    } catch { setSelected(r); }
  };

  const filtered = search
    ? resignations.filter(r =>
        `${r.first_name} ${r.last_name} ${r.emp_code}`.toLowerCase().includes(search.toLowerCase())
      )
    : resignations;

  // Summary counts
  const counts = resignations.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
            <LogOut size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-oe-text">Resignations</h1>
            <p className="text-xs text-oe-muted mt-0.5">Offboarding & exit management</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setCreateModal(true)} className="btn-primary">
            <Plus size={15}/> New Resignation
          </button>
        )}
      </div>

      {/* Summary cards */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
                className={`card p-3 text-left transition-all ${statusFilter === key ? 'ring-2 ring-oe-primary' : ''}`}
              >
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold mb-1.5 ${cfg.cls}`}>
                  <Icon size={10} /> {cfg.label}
                </div>
                <div className="text-2xl font-bold text-oe-text">{counts[key] || 0}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
          <input className="input pl-9" placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input sm:w-40" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <LogOut size={32} className="text-oe-muted mx-auto mb-2" />
            <p className="text-sm text-oe-muted">No resignations found.</p>
            {isAdmin && <button onClick={() => setCreateModal(true)} className="btn-primary mt-3 text-xs"><Plus size={12}/> Create First</button>}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-oe-surface/50">
                  <tr>
                    {['Employee', 'Department', 'Resignation Date', 'Last Day', 'Notice', 'Reason', 'Status', ''].map(h => (
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="table-row cursor-pointer" onClick={() => openDetail(r)}>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {r.first_name?.[0]}{r.last_name?.[0]}
                          </div>
                          <div>
                            <div className="font-medium text-oe-text text-sm">{r.first_name} {r.last_name}</div>
                            <div className="text-[11px] text-oe-muted">{r.emp_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell text-xs text-oe-muted">{r.department_name || '—'}</td>
                      <td className="table-cell text-xs">{fmtDate(r.resignation_date)}</td>
                      <td className="table-cell text-xs font-medium text-oe-danger">{fmtDate(r.last_working_day)}</td>
                      <td className="table-cell text-xs text-oe-muted">{r.notice_period_days}d</td>
                      <td className="table-cell text-xs text-oe-muted">{r.reason || '—'}</td>
                      <td className="table-cell"><StatusBadge status={r.status} /></td>
                      <td className="table-cell"><ChevronRight size={14} className="text-oe-muted" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-oe-border">
              {filtered.map(r => (
                <div key={r.id} className="p-4 space-y-2 cursor-pointer" onClick={() => openDetail(r)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {r.first_name?.[0]}{r.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-oe-text text-sm truncate">{r.first_name} {r.last_name}</div>
                        <div className="text-[11px] text-oe-muted">{r.emp_code} · {r.department_name || '—'}</div>
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-oe-muted">
                    <span><Calendar size={10} className="inline mr-1" />Resigned {fmtDate(r.resignation_date)}</span>
                    <span className="text-oe-danger">Last day {fmtDate(r.last_working_day)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {total > 20 && (
              <div className="px-5 py-3 border-t border-oe-border flex items-center justify-between text-xs text-oe-muted">
                <span>{total} total</span>
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1 px-2 text-xs disabled:opacity-40">Prev</button>
                  <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1 px-2 text-xs disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <ResignationDetailModal
          resignation={selected}
          onClose={() => setSelected(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onComplete={handleComplete}
          onWithdraw={handleWithdraw}
          isAdmin={isAdmin}
        />
      )}

      {/* Create Modal */}
      {createModal && (
        <CreateResignationModal
          onClose={() => setCreateModal(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}

export default function ResignationsPage() {
  return (
    <PrivateRoute minLevel="hr_admin">
      <Layout>
        <ResignationsContent />
      </Layout>
    </PrivateRoute>
  );
}
