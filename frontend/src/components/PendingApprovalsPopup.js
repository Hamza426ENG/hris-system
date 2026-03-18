import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, XCircle, Calendar, Home, LogOut, CheckCircle2 } from 'lucide-react';
import { leavesAPI, wfhAPI, resignationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function Empty({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-oe-muted">
      <CheckCircle2 size={36} className="mb-3 text-oe-success/40" />
      <p className="text-sm font-medium">All caught up!</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
}

function EmployeeRow({ name, dept, position }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full gradient-bg flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
        {(name || '?').charAt(0)}
      </div>
      <div>
        <div className="font-semibold text-oe-text text-sm">{name}</div>
        <div className="text-xs text-oe-muted">{[dept, position].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

function ActionBtns({ id, actingId, onApprove, onReject }) {
  const busy = actingId === id;
  return (
    <div className="flex gap-2 mt-3">
      <button onClick={onApprove} disabled={busy}
        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-oe-success/10 text-oe-success hover:bg-oe-success hover:text-white transition-colors text-xs font-medium border border-oe-success/20 disabled:opacity-50">
        {busy ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={13} />}
        Approve
      </button>
      <button onClick={onReject} disabled={busy}
        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-oe-danger/10 text-oe-danger hover:bg-oe-danger hover:text-white transition-colors text-xs font-medium border border-oe-danger/20 disabled:opacity-50">
        {busy ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : <XCircle size={13} />}
        Reject
      </button>
    </div>
  );
}

export default function PendingApprovalsPopup({ onClose }) {
  const { user } = useAuth();
  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);
  const empId = user?.employeeId;

  const [tab, setTab] = useState('leaves');
  const [leaves, setLeaves] = useState([]);
  const [wfh, setWfh] = useState([]);
  const [resignations, setResignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, wRes, rRes] = await Promise.all([
        leavesAPI.list({ status: 'pending' }),
        wfhAPI.list(),
        resignationsAPI.list(),
      ]);

      setLeaves((lRes.data || []).filter(l => l.status === 'pending'));

      const allWFH = wRes.data || [];
      setWfh(allWFH.filter(w => w.status === 'pending' && w.supervisor_id === empId));

      const allRes = rRes.data || [];
      if (isHR) {
        setResignations(allRes.filter(r => r.status === 'supervisor_approved'));
      } else {
        setResignations(allRes.filter(r => r.status === 'pending' && r.supervisor_id === empId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [empId, isHR]);

  useEffect(() => { load(); }, [load]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const act = async (fn, id) => {
    setActingId(id);
    try { await fn(); await load(); }
    catch (err) { alert(err.response?.data?.error || 'Failed'); }
    finally { setActingId(null); }
  };

  const TABS = [
    { id: 'leaves',       label: 'Leave Requests',  count: leaves.length,       icon: Calendar, accent: 'amber'  },
    { id: 'wfh',          label: 'Work From Home',  count: wfh.length,          icon: Home,     accent: 'blue'   },
    { id: 'resignations', label: 'Resignations',    count: resignations.length, icon: LogOut,   accent: 'red'    },
  ];

  const total = leaves.length + wfh.length + resignations.length;

  const accentCls = {
    amber: { card: 'border-amber-100 bg-amber-50/40', badge: 'bg-amber-100 text-amber-700 border-amber-200', tag: 'bg-amber-100 text-amber-700 border-amber-200' },
    blue:  { card: 'border-blue-100 bg-blue-50/40',   badge: 'bg-blue-100 text-blue-700 border-blue-200',   tag: 'bg-blue-100 text-blue-700 border-blue-200'   },
    red:   { card: 'border-red-100 bg-red-50/40',     badge: 'bg-red-100 text-red-700 border-red-200',     tag: 'bg-red-100 text-red-700 border-red-200'     },
  };

  const currentAccent = TABS.find(t => t.id === tab)?.accent || 'amber';
  const cls = accentCls[currentAccent];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-oe-text">Pending Approvals</h2>
            <p className="text-xs text-oe-muted mt-0.5">
              {loading ? 'Loading…' : total === 0 ? 'All caught up — no pending requests.' : `${total} request${total !== 1 ? 's' : ''} awaiting your action`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-oe-muted transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 flex-shrink-0 px-2">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  active ? 'border-oe-primary text-oe-primary' : 'border-transparent text-oe-muted hover:text-oe-text'
                }`}>
                <t.icon size={14} />
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  active ? 'bg-oe-primary text-white' : t.count > 0 ? 'bg-oe-danger text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ── LEAVES ── */}
              {tab === 'leaves' && (
                leaves.length === 0
                  ? <Empty label="No pending leave requests" />
                  : <div className="space-y-3">
                      {leaves.map(l => (
                        <div key={l.id} className={`p-4 rounded-xl border ${cls.card}`}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <EmployeeRow name={l.employee_name} dept={l.department_name} position={l.position_title} />
                            <span className={`text-xs px-2 py-1 rounded-full font-medium border flex-shrink-0 ${cls.tag}`}>
                              {l.leave_type_name}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-oe-muted pl-12">
                            <span><span className="font-medium text-oe-text">From:</span> {fmtDate(l.start_date)}</span>
                            <span><span className="font-medium text-oe-text">To:</span> {fmtDate(l.end_date)}</span>
                            <span><span className="font-medium text-oe-text">Days:</span> {l.total_days}</span>
                            <span><span className="font-medium text-oe-text">Type:</span> {l.is_paid ? 'Paid' : 'Unpaid'}</span>
                          </div>
                          {l.reason && <p className="text-xs text-oe-muted pl-12 mt-1 italic">"{l.reason}"</p>}
                          <div className="pl-12">
                            <ActionBtns id={l.id} actingId={actingId}
                              onApprove={() => act(() => leavesAPI.approve(l.id, { comment: 'Approved' }), l.id)}
                              onReject={() => act(() => leavesAPI.reject(l.id, { comment: 'Rejected' }), l.id)} />
                          </div>
                        </div>
                      ))}
                    </div>
              )}

              {/* ── WFH ── */}
              {tab === 'wfh' && (
                wfh.length === 0
                  ? <Empty label="No pending WFH requests from your team" />
                  : <div className="space-y-3">
                      {wfh.map(w => (
                        <div key={w.id} className={`p-4 rounded-xl border ${cls.card}`}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <EmployeeRow name={w.employee_name} dept={w.department_name} position={w.position_title} />
                            <span className={`text-xs px-2 py-1 rounded-full font-medium border flex-shrink-0 ${cls.tag}`}>
                              {fmtDate(w.date)}
                            </span>
                          </div>
                          {w.reason && <p className="text-xs text-oe-muted pl-12 mt-1 italic">"{w.reason}"</p>}
                          <div className="pl-12">
                            <ActionBtns id={w.id} actingId={actingId}
                              onApprove={() => act(() => wfhAPI.review(w.id, 'approve', null), w.id)}
                              onReject={() => act(() => wfhAPI.review(w.id, 'reject', null), w.id)} />
                          </div>
                        </div>
                      ))}
                    </div>
              )}

              {/* ── RESIGNATIONS ── */}
              {tab === 'resignations' && (
                resignations.length === 0
                  ? <Empty label={isHR ? 'No supervisor-approved resignations awaiting HR decision' : 'No pending resignations from your team'} />
                  : <div className="space-y-3">
                      {resignations.map(r => (
                        <div key={r.id} className={`p-4 rounded-xl border ${cls.card}`}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <EmployeeRow name={r.employee_name} dept={r.department_name} position={r.position_title} />
                            <div className="text-right flex-shrink-0">
                              <div className="text-xs text-oe-muted">Last Working Day</div>
                              <div className="text-xs font-semibold text-oe-text">{fmtDate(r.last_working_day)}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-oe-muted pl-12">
                            {r.days_serving != null && (
                              <>
                                <span><span className="font-medium text-oe-text">Serving:</span> {r.days_serving} days</span>
                                {r.days_skipping > 0 && (
                                  <span className="text-amber-600"><span className="font-medium">Skipping:</span> {r.days_skipping} days</span>
                                )}
                              </>
                            )}
                          </div>
                          {r.reason && <p className="text-xs text-oe-muted pl-12 mt-1 italic">"{r.reason}"</p>}
                          {isHR && r.supervisor_comment && (
                            <p className="text-xs text-slate-500 pl-12 mt-1">
                              <span className="font-medium">Supervisor note:</span> "{r.supervisor_comment}"
                            </p>
                          )}
                          <div className="pl-12">
                            <ActionBtns id={r.id} actingId={actingId}
                              onApprove={() => act(() => isHR ? resignationsAPI.hrReview(r.id, 'approve', null) : resignationsAPI.supervisorReview(r.id, 'approve', null), r.id)}
                              onReject={() => act(() => isHR ? resignationsAPI.hrReview(r.id, 'reject', null) : resignationsAPI.supervisorReview(r.id, 'reject', null), r.id)} />
                          </div>
                        </div>
                      ))}
                    </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
