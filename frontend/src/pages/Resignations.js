import React, { useState, useEffect } from 'react';
import { resignationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LogOut, CheckCircle, XCircle, Clock, AlertTriangle, X, MessageSquare } from 'lucide-react';

const STATUS_CONFIG = {
  pending:              { label: 'Pending Review',       cls: 'bg-yellow-100 text-yellow-700 border-yellow-200',  dot: 'bg-yellow-400' },
  supervisor_approved:  { label: 'Supervisor Approved',  cls: 'bg-blue-100 text-blue-700 border-blue-200',        dot: 'bg-blue-500'   },
  supervisor_rejected:  { label: 'Supervisor Rejected',  cls: 'bg-red-100 text-red-700 border-red-200',           dot: 'bg-red-400'    },
  hr_approved:          { label: 'HR Approved',          cls: 'bg-green-100 text-green-700 border-green-200',     dot: 'bg-green-500'  },
  hr_rejected:          { label: 'HR Rejected',          cls: 'bg-red-100 text-red-700 border-red-200',           dot: 'bg-red-500'    },
  withdrawn:            { label: 'Withdrawn',            cls: 'bg-slate-100 text-slate-500 border-slate-200',     dot: 'bg-slate-400'  },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function Resignations() {
  const { user } = useAuth();
  const role = user?.role;
  const isHR = ['super_admin', 'hr_admin'].includes(role);
  const isTeamLead = role === 'team_lead';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [reviewModal, setReviewModal] = useState(null); // { id, type: 'supervisor'|'hr', action: 'approve'|'reject' }
  const [comment, setComment] = useState('');
  const [actingId, setActingId] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const addDays = (dateStr, n) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  };
  const [form, setForm] = useState({ resignation_date: todayStr, last_working_day: addDays(todayStr, 30), reasonOption: '', reasonOther: '' });
  const [submitting, setSubmitting] = useState(false);

  const noticeSummary = () => {
    if (!form.resignation_date || !form.last_working_day) return null;
    const diff = Math.round((new Date(form.last_working_day) - new Date(form.resignation_date)) / 86400000);
    const serving = Math.min(Math.max(diff, 0), 30);
    const skipping = Math.max(0, 30 - serving);
    return { serving, skipping };
  };

  const load = () => {
    setLoading(true);
    resignationsAPI.list()
      .then(res => setItems(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const myResignation = items.find(r => r.employee_id === user?.employeeId && ['pending', 'supervisor_approved'].includes(r.status));

  const filtered = filter === 'all' ? items : items.filter(r => r.status === filter);

  const handleReview = async () => {
    if (!reviewModal) return;
    setActingId(reviewModal.id);
    try {
      if (reviewModal.type === 'supervisor') {
        await resignationsAPI.supervisorReview(reviewModal.id, reviewModal.action, comment);
      } else {
        await resignationsAPI.hrReview(reviewModal.id, reviewModal.action, comment);
      }
      setReviewModal(null);
      setComment('');
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
    finally { setActingId(null); }
  };

  const handleWithdraw = async (id) => {
    if (!window.confirm('Withdraw your resignation?')) return;
    try { await resignationsAPI.withdraw(id); load(); }
    catch (err) { alert(err.response?.data?.error || 'Failed'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const reason = form.reasonOption === 'Other' ? form.reasonOther : form.reasonOption;
      await resignationsAPI.submit({ resignation_date: form.resignation_date, last_working_day: form.last_working_day, reason });
      setShowSubmit(false);
      setForm({ resignation_date: todayStr, last_working_day: addDays(todayStr, 30), reasonOption: '', reasonOther: '' });
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed to submit'); }
    finally { setSubmitting(false); }
  };

  const canSupervisorReview = (r) => isTeamLead && r.supervisor_id === user?.employeeId && r.status === 'pending';
  const canHRReview = (r) => isHR && ['pending', 'supervisor_approved', 'supervisor_rejected'].includes(r.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-oe-text">Resignations</h1>
          <p className="text-sm text-oe-muted mt-0.5">
            {isHR ? 'Manage all employee resignations' : isTeamLead ? "Your team's resignations" : 'Your resignation status'}
          </p>
        </div>
        {!myResignation && (
          <button onClick={() => setShowSubmit(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-oe-danger text-white text-sm font-semibold hover:bg-red-700 transition-colors">
            <LogOut size={15} />Submit Resignation
          </button>
        )}
      </div>

      {/* Filter tabs — HR/TeamLead only */}
      {(isHR || isTeamLead) && (
        <div className="flex gap-1 bg-oe-surface rounded-xl p-1 w-fit flex-wrap">
          {[
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'supervisor_approved', label: 'Sup. Approved' },
            { key: 'supervisor_rejected', label: 'Sup. Rejected' },
            { key: 'hr_approved', label: 'HR Approved' },
            { key: 'hr_rejected', label: 'HR Rejected' },
            { key: 'withdrawn', label: 'Withdrawn' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                filter === f.key ? 'bg-white text-oe-text shadow' : 'text-oe-muted hover:text-oe-text'
              }`}>
              {f.label}
              {f.key !== 'all' && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-oe-primary/10 text-oe-primary text-xs font-semibold">
                  {items.filter(r => r.status === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <LogOut size={40} className="mx-auto text-oe-muted mb-3" />
          <p className="text-oe-muted">No resignations found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
            const isMe = r.employee_id === user?.employeeId;
            return (
              <div key={r.id} className="card p-5">
                <div className="flex items-start gap-4 flex-wrap">
                  {/* Avatar + info */}
                  <div className="flex items-start gap-3 flex-1 min-w-[200px]">
                    <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                      {(r.employee_name || '?').charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-oe-text">{r.employee_name} {isMe && <span className="text-xs text-oe-primary font-normal">(You)</span>}</div>
                      <div className="text-xs text-oe-muted">{r.position_title} · {r.department_name}</div>
                      <div className="text-xs text-oe-muted mt-0.5">Submitted: {fmtDate(r.created_at)}</div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <div className="text-xs text-oe-muted">Last Working Day</div>
                      <div className="font-medium text-oe-text">{fmtDate(r.last_working_day)}</div>
                    </div>
                    {(r.days_serving != null) && (
                      <div>
                        <div className="text-xs text-oe-muted">Notice</div>
                        <div className="font-medium text-oe-text text-xs">
                          {r.days_serving}d serving{r.days_skipping > 0 && <span className="text-amber-600 ml-1">/ {r.days_skipping}d skip</span>}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-oe-muted">Supervisor</div>
                      <div className="font-medium text-oe-text">{r.supervisor_name || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-oe-muted">Status</div>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 items-center ml-auto">
                    {canSupervisorReview(r) && (
                      <>
                        <button onClick={() => { setReviewModal({ id: r.id, type: 'supervisor', action: 'approve' }); setComment(''); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-oe-success/10 text-oe-success hover:bg-oe-success hover:text-white transition-colors text-sm font-medium">
                          <CheckCircle size={14} />Accept
                        </button>
                        <button onClick={() => { setReviewModal({ id: r.id, type: 'supervisor', action: 'reject' }); setComment(''); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-oe-danger/10 text-oe-danger hover:bg-oe-danger hover:text-white transition-colors text-sm font-medium">
                          <XCircle size={14} />Reject
                        </button>
                      </>
                    )}
                    {canHRReview(r) && (
                      <>
                        <button onClick={() => { setReviewModal({ id: r.id, type: 'hr', action: 'approve' }); setComment(''); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-oe-success/10 text-oe-success hover:bg-oe-success hover:text-white transition-colors text-sm font-medium">
                          <CheckCircle size={14} />Approve
                        </button>
                        <button onClick={() => { setReviewModal({ id: r.id, type: 'hr', action: 'reject' }); setComment(''); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-oe-danger/10 text-oe-danger hover:bg-oe-danger hover:text-white transition-colors text-sm font-medium">
                          <XCircle size={14} />Reject
                        </button>
                      </>
                    )}
                    {isMe && ['pending', 'supervisor_approved'].includes(r.status) && (
                      <button onClick={() => handleWithdraw(r.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm font-medium">
                        <X size={14} />Withdraw
                      </button>
                    )}
                  </div>
                </div>

                {/* Reason / comments */}
                {(r.reason || r.supervisor_comment || r.hr_comment) && (
                  <div className="mt-3 pt-3 border-t border-oe-border space-y-1.5">
                    {r.reason && <p className="text-xs text-oe-muted"><span className="font-medium text-oe-text">Reason:</span> {r.reason}</p>}
                    {r.supervisor_comment && <p className="text-xs text-oe-muted"><span className="font-medium text-oe-text">Supervisor note:</span> {r.supervisor_comment}</p>}
                    {r.hr_comment && <p className="text-xs text-oe-muted"><span className="font-medium text-oe-text">HR note:</span> {r.hr_comment}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-oe-text capitalize">
                {reviewModal.action === 'approve' ? '✓ Accept' : '✗ Reject'} Resignation
                <span className="text-xs text-oe-muted font-normal ml-2">({reviewModal.type === 'hr' ? 'HR decision' : 'Supervisor decision'})</span>
              </h2>
              <button onClick={() => setReviewModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-oe-muted"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-oe-text mb-1.5">
                  Comment <span className="text-oe-muted font-normal">(optional)</span>
                </label>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                  placeholder="Add a comment for the employee..."
                  className="input w-full resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setReviewModal(null)} className="flex-1 btn-secondary">Cancel</button>
                <button onClick={handleReview} disabled={!!actingId}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                    reviewModal.action === 'approve' ? 'bg-oe-success hover:bg-green-700' : 'bg-oe-danger hover:bg-red-700'
                  }`}>
                  {actingId ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
                    reviewModal.action === 'approve' ? <><CheckCircle size={15} />Confirm Accept</> : <><XCircle size={15} />Confirm Reject</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit resignation modal */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-oe-text">Submit Resignation</h2>
                <p className="text-xs text-oe-muted mt-0.5">Sent to your immediate supervisor for review</p>
              </div>
              <button onClick={() => setShowSubmit(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-oe-muted"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-oe-text mb-1.5">Resign Date</label>
                  <input type="date" value={form.resignation_date}
                    onChange={e => setForm(f => ({ ...f, resignation_date: e.target.value, last_working_day: addDays(e.target.value, 30) }))}
                    min={todayStr} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-oe-text mb-1.5">Last Working Day</label>
                  <input type="date" value={form.last_working_day}
                    onChange={e => setForm(f => ({ ...f, last_working_day: e.target.value }))}
                    min={form.resignation_date || todayStr} className="input w-full" />
                </div>
              </div>
              {(() => { const ns = noticeSummary(); if (!ns) return null;
                return (
                  <div className={`rounded-xl p-3 text-xs flex items-start gap-2 ${ns.skipping > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                    <AlertTriangle size={14} className={`flex-shrink-0 mt-0.5 ${ns.skipping > 0 ? 'text-amber-500' : 'text-green-500'}`} />
                    <div>
                      <span className={ns.skipping > 0 ? 'text-amber-800' : 'text-green-800'}>
                        Notice period: <strong>30 days</strong> &nbsp;|&nbsp;
                        Serving: <strong>{ns.serving} days</strong> &nbsp;|&nbsp;
                        Skipping: <strong>{ns.skipping} days</strong>
                      </span>
                      {ns.skipping > 0 && <p className="text-amber-700 mt-0.5">Salary deduction may apply for {ns.skipping} skipped day{ns.skipping > 1 ? 's' : ''}.</p>}
                    </div>
                  </div>
                );
              })()}
              <div>
                <label className="block text-sm font-medium text-oe-text mb-1.5">Reason</label>
                <select value={form.reasonOption} onChange={e => setForm(f => ({ ...f, reasonOption: e.target.value, reasonOther: '' }))}
                  className="input w-full">
                  <option value="">Select a reason...</option>
                  <option>Better Opportunity</option>
                  <option>Moving Abroad</option>
                  <option>Getting Married</option>
                  <option>Personal Reasons</option>
                  <option>Other</option>
                </select>
              </div>
              {form.reasonOption === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-oe-text mb-1.5">Please specify</label>
                  <textarea value={form.reasonOther} onChange={e => setForm(f => ({ ...f, reasonOther: e.target.value }))}
                    rows={3} placeholder="Describe your reason..." className="input w-full resize-none" autoFocus />
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">Your resignation goes to your supervisor first, then HR. You can withdraw while it's still pending.</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowSubmit(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-oe-danger text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogOut size={15} />}
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
