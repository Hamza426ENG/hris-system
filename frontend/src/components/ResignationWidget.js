import React, { useState, useEffect } from 'react';
import { LogOut, CheckCircle, XCircle, Clock, AlertTriangle, ChevronRight, X } from 'lucide-react';
import { resignationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const STATUS_CONFIG = {
  pending:              { label: 'Pending Review',       cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  supervisor_approved:  { label: 'Supervisor Approved',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  supervisor_rejected:  { label: 'Supervisor Rejected',  cls: 'bg-red-100 text-red-700 border-red-200' },
  hr_approved:          { label: 'HR Approved',          cls: 'bg-green-100 text-green-700 border-green-200' },
  hr_rejected:          { label: 'HR Rejected',          cls: 'bg-red-100 text-red-700 border-red-200' },
  withdrawn:            { label: 'Withdrawn',            cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function ResignationWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const isHR = ['super_admin', 'hr_admin'].includes(role);
  const isTeamLead = role === 'team_lead';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const addDays = (dateStr, n) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
  const [form, setForm] = useState({ resignation_date: todayStr, last_working_day: addDays(todayStr, 30), reasonOption: '', reasonOther: '' });
  const [submitting, setSubmitting] = useState(false);

  const noticeSummary = () => {
    if (!form.resignation_date || !form.last_working_day) return null;
    const diff = Math.round((new Date(form.last_working_day) - new Date(form.resignation_date)) / 86400000);
    const serving = Math.min(Math.max(diff, 0), 30);
    return { serving, skipping: Math.max(0, 30 - serving) };
  };
  const [actingId, setActingId] = useState(null);

  const load = () => {
    resignationsAPI.active()
      .then(res => setItems(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const myResignation = items.find(r => r.employee_id === user?.employeeId);
  const teamPending = isTeamLead ? items.filter(r => r.supervisor_id === user?.employeeId && r.status === 'pending') : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const reason = form.reasonOption === 'Other' ? form.reasonOther : form.reasonOption;
      await resignationsAPI.submit({ resignation_date: form.resignation_date, last_working_day: form.last_working_day, reason });
      setShowSubmit(false);
      setForm({ resignation_date: todayStr, last_working_day: addDays(todayStr, 30), reasonOption: '', reasonOther: '' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  const handleSupervisorAction = async (id, action) => {
    setActingId(id);
    try {
      await resignationsAPI.supervisorReview(id, action, null);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
    finally { setActingId(null); }
  };

  const handleWithdraw = async (id) => {
    if (!window.confirm('Withdraw your resignation?')) return;
    try {
      await resignationsAPI.withdraw(id);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
  };

  if (loading) return null;

  return (
    <div className="card p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogOut size={16} className="text-oe-danger" />
          <h3 className="font-semibold text-oe-text text-sm">Resignations</h3>
        </div>
        {(isHR) && (
          <button onClick={() => navigate('/resignations')} className="text-xs text-oe-primary hover:underline flex items-center gap-0.5">
            View All <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* HR: summary count */}
      {isHR && (
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-oe-muted text-center py-3">No active resignations</p>
          ) : (
            items.slice(0, 4).map(r => {
              const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
              return (
                <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-oe-surface/60 border border-oe-border/50">
                  <div className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {(r.employee_name || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-oe-text truncate">{r.employee_name}</div>
                    <div className="text-xs text-oe-muted">{r.department_name}</div>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${cfg.cls}`}>
                    {r.status === 'pending' ? 'Pending' : r.status === 'supervisor_approved' ? 'Sup. Approved' : cfg.label}
                  </span>
                </div>
              );
            })
          )}
          {items.length > 4 && (
            <button onClick={() => navigate('/resignations')} className="text-xs text-oe-primary hover:underline w-full text-center">
              +{items.length - 4} more
            </button>
          )}
        </div>
      )}

      {/* Team Lead: pending from team */}
      {isTeamLead && (
        <div className="space-y-2">
          {teamPending.length === 0 ? (
            <p className="text-xs text-oe-muted text-center py-2">No pending resignations from your team</p>
          ) : teamPending.map(r => (
            <div key={r.id} className="p-2.5 rounded-lg border border-yellow-200 bg-yellow-50 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-white">
                  {(r.employee_name || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-oe-text truncate">{r.employee_name}</div>
                  <div className="text-xs text-oe-muted">LWD: {fmtDate(r.last_working_day)}</div>
                </div>
              </div>
              {r.reason && <p className="text-xs text-slate-600 italic line-clamp-2">"{r.reason}"</p>}
              <div className="flex gap-1.5">
                <button onClick={() => handleSupervisorAction(r.id, 'approve')} disabled={actingId === r.id}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-oe-success/10 text-oe-success hover:bg-oe-success hover:text-white transition-colors text-xs font-medium">
                  <CheckCircle size={12} />Accept
                </button>
                <button onClick={() => handleSupervisorAction(r.id, 'reject')} disabled={actingId === r.id}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-oe-danger/10 text-oe-danger hover:bg-oe-danger hover:text-white transition-colors text-xs font-medium">
                  <XCircle size={12} />Reject
                </button>
              </div>
            </div>
          ))}

          {/* Team lead's own resignation */}
          {myResignation && (
            <div className="pt-2 border-t border-oe-border">
              <div className="text-xs text-oe-muted mb-1">Your resignation:</div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[myResignation.status]?.cls}`}>
                  {STATUS_CONFIG[myResignation.status]?.label}
                </span>
                {['pending', 'supervisor_approved'].includes(myResignation.status) && (
                  <button onClick={() => handleWithdraw(myResignation.id)} className="text-xs text-oe-muted hover:text-oe-danger">Withdraw</button>
                )}
              </div>
            </div>
          )}

          {!myResignation && (
            <button onClick={() => setShowSubmit(true)} className="w-full text-xs text-oe-danger hover:underline text-center pt-1 border-t border-oe-border mt-1">
              + Submit Your Resignation
            </button>
          )}
        </div>
      )}

      {/* Employee: own resignation */}
      {!isHR && !isTeamLead && (
        <div>
          {myResignation ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[myResignation.status]?.cls}`}>
                  {STATUS_CONFIG[myResignation.status]?.label}
                </span>
                <span className="text-xs text-oe-muted">LWD: {fmtDate(myResignation.last_working_day)}</span>
              </div>
              {myResignation.supervisor_comment && (
                <p className="text-xs text-oe-muted bg-oe-surface rounded-lg p-2">
                  Supervisor: "{myResignation.supervisor_comment}"
                </p>
              )}
              {['pending', 'supervisor_approved'].includes(myResignation.status) && (
                <button onClick={() => handleWithdraw(myResignation.id)}
                  className="w-full text-xs text-oe-danger border border-oe-danger/30 rounded-lg py-1.5 hover:bg-oe-danger hover:text-white transition-colors">
                  Withdraw Resignation
                </button>
              )}
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xs text-oe-muted mb-3">No active resignation</p>
              <button onClick={() => setShowSubmit(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-oe-danger/30 text-oe-danger text-xs font-medium hover:bg-oe-danger hover:text-white transition-colors">
                <LogOut size={13} />Submit Resignation
              </button>
            </div>
          )}
        </div>
      )}

      {/* Submit modal */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-oe-text">Submit Resignation</h2>
                <p className="text-xs text-oe-muted mt-0.5">This will be sent to your immediate supervisor</p>
              </div>
              <button onClick={() => setShowSubmit(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-oe-muted">
                <X size={18} />
              </button>
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
                    <div className={ns.skipping > 0 ? 'text-amber-800' : 'text-green-800'}>
                      Notice: <strong>30 days</strong> &nbsp;|&nbsp; Serving: <strong>{ns.serving}d</strong> &nbsp;|&nbsp; Skipping: <strong>{ns.skipping}d</strong>
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
                    rows={3} placeholder="Describe your reason..."
                    className="input w-full resize-none" autoFocus />
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">Your resignation will be reviewed by your supervisor, then HR. You can withdraw it while it's still pending.</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowSubmit(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-oe-danger text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogOut size={15} />}
                  Submit Resignation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
