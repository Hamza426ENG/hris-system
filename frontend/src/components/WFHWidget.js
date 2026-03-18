import React, { useState, useEffect } from 'react';
import { Home, CheckCircle, XCircle, X, AlertTriangle, ChevronRight } from 'lucide-react';
import { wfhAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const STATUS_CONFIG = {
  pending:   { label: 'Pending Approval', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approved:  { label: 'Approved',         cls: 'bg-green-100 text-green-700 border-green-200' },
  rejected:  { label: 'Rejected',         cls: 'bg-red-100 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelled',        cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const WFH_REASONS = [
  'Medical / Not Feeling Well',
  'Family Emergency',
  'Home Repairs / Maintenance',
  'Bad Weather / Transport Issue',
  'Personal Appointment',
  'Focus / Deep Work',
  'Other',
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const todayStr = () => new Date().toISOString().split('T')[0];

export default function WFHWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const isHR = ['super_admin', 'hr_admin'].includes(role);
  const isTeamLead = role === 'team_lead';

  const [items, setItems] = useState([]);
  const [todayWFH, setTodayWFH] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const [showSubmit, setShowSubmit] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), reasonOption: '', reasonOther: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    const calls = [wfhAPI.list().then(r => setItems(r.data || [])).catch(() => {})];
    if (isHR) calls.push(wfhAPI.today().then(r => setTodayWFH(r.data || [])).catch(() => {}));
    Promise.all(calls).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const myActive = items.find(r =>
    r.employee_id === user?.employeeId && ['pending', 'approved'].includes(r.status) &&
    new Date(r.date) >= new Date(todayStr())
  );

  const teamPending = isTeamLead
    ? items.filter(r => r.supervisor_id === user?.employeeId && r.status === 'pending')
    : [];

  const handleReview = async (id, action) => {
    setActingId(id);
    try {
      await wfhAPI.review(id, action, null);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
    finally { setActingId(null); }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this WFH request?')) return;
    try { await wfhAPI.cancel(id); load(); }
    catch (err) { alert(err.response?.data?.error || 'Failed'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reasonOption) { alert('Please select a reason.'); return; }
    setSubmitting(true);
    try {
      const reason = form.reasonOption === 'Other' ? form.reasonOther : form.reasonOption;
      await wfhAPI.submit({ date: form.date, reason });
      setShowSubmit(false);
      setForm({ date: todayStr(), reasonOption: '', reasonOther: '' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  if (loading) return null;

  return (
    <div className="card p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home size={16} className="text-oe-primary" />
          <h3 className="font-semibold text-oe-text text-sm">Work From Home</h3>
        </div>
        {isHR && (
          <span className="text-xs text-oe-primary font-semibold bg-oe-primary/10 px-2 py-0.5 rounded-full">
            {todayWFH.length} today
          </span>
        )}
      </div>

      {/* HR: today's WFH list + pending reviews */}
      {isHR && (
        <div className="space-y-2">
          {todayWFH.length === 0 && items.filter(r => r.status === 'pending').length === 0 ? (
            <p className="text-xs text-oe-muted text-center py-3">No WFH activity today</p>
          ) : (
            <>
              {/* Today approved */}
              {todayWFH.slice(0, 3).map(r => (
                <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-100">
                  <div className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {(r.employee_name || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-oe-text truncate">{r.employee_name}</div>
                    <div className="text-xs text-oe-muted">{r.department_name}</div>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium flex-shrink-0">WFH</span>
                </div>
              ))}
              {todayWFH.length > 3 && (
                <p className="text-xs text-oe-muted text-center">+{todayWFH.length - 3} more employees WFH today</p>
              )}
              {/* Pending requests */}
              {items.filter(r => r.status === 'pending').slice(0, 2).map(r => (
                <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50 border border-yellow-100">
                  <div className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {(r.employee_name || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-oe-text truncate">{r.employee_name}</div>
                    <div className="text-xs text-oe-muted">{fmtDate(r.date)}</div>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 font-medium flex-shrink-0">Pending</span>
                </div>
              ))}
            </>
          )}
          {/* HR own WFH */}
          {myActive ? (
            <div className="pt-2 border-t border-oe-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-oe-muted">Your WFH ({fmtDate(myActive.date)}):</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[myActive.status]?.cls}`}>
                  {STATUS_CONFIG[myActive.status]?.label}
                </span>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowSubmit(true)} className="w-full text-xs text-oe-primary hover:underline text-center pt-1 border-t border-oe-border">
              + Request WFH for Yourself
            </button>
          )}
        </div>
      )}

      {/* Team Lead: team's pending + own */}
      {isTeamLead && (
        <div className="space-y-2">
          {teamPending.length === 0 ? (
            <p className="text-xs text-oe-muted text-center py-2">No pending WFH requests from your team</p>
          ) : teamPending.map(r => (
            <div key={r.id} className="p-2.5 rounded-lg border border-yellow-200 bg-yellow-50 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-white">
                  {(r.employee_name || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-oe-text truncate">{r.employee_name}</div>
                  <div className="text-xs text-oe-muted">{fmtDate(r.date)}</div>
                </div>
              </div>
              {r.reason && <p className="text-xs text-slate-600 italic line-clamp-2">"{r.reason}"</p>}
              <div className="flex gap-1.5">
                <button onClick={() => handleReview(r.id, 'approve')} disabled={actingId === r.id}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-oe-success/10 text-oe-success hover:bg-oe-success hover:text-white transition-colors text-xs font-medium">
                  <CheckCircle size={12} />Approve
                </button>
                <button onClick={() => handleReview(r.id, 'reject')} disabled={actingId === r.id}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-oe-danger/10 text-oe-danger hover:bg-oe-danger hover:text-white transition-colors text-xs font-medium">
                  <XCircle size={12} />Reject
                </button>
              </div>
            </div>
          ))}

          {/* Team lead's own WFH */}
          {myActive ? (
            <div className="pt-2 border-t border-oe-border">
              <div className="text-xs text-oe-muted mb-1">Your WFH ({fmtDate(myActive.date)}):</div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[myActive.status]?.cls}`}>
                  {STATUS_CONFIG[myActive.status]?.label}
                </span>
                {myActive.status === 'pending' && (
                  <button onClick={() => handleCancel(myActive.id)} className="text-xs text-oe-muted hover:text-oe-danger">Cancel</button>
                )}
              </div>
            </div>
          ) : (
            <button onClick={() => setShowSubmit(true)} className="w-full text-xs text-oe-danger hover:underline text-center pt-1 border-t border-oe-border mt-1">
              + Request WFH for Yourself
            </button>
          )}
        </div>
      )}

      {/* Employee: own WFH */}
      {!isHR && !isTeamLead && (
        <div>
          {myActive ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[myActive.status]?.cls}`}>
                  {STATUS_CONFIG[myActive.status]?.label}
                </span>
                <span className="text-xs text-oe-muted">{fmtDate(myActive.date)}</span>
              </div>
              {myActive.reason && (
                <p className="text-xs text-oe-muted bg-oe-surface rounded-lg p-2 italic">"{myActive.reason}"</p>
              )}
              {myActive.supervisor_comment && (
                <p className="text-xs text-oe-muted bg-oe-surface rounded-lg p-2">
                  Supervisor: "{myActive.supervisor_comment}"
                </p>
              )}
              {myActive.status === 'pending' && (
                <button onClick={() => handleCancel(myActive.id)}
                  className="w-full text-xs text-oe-danger border border-oe-danger/30 rounded-lg py-1.5 hover:bg-oe-danger hover:text-white transition-colors">
                  Cancel Request
                </button>
              )}
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xs text-oe-muted mb-3">No upcoming WFH request</p>
              <button onClick={() => setShowSubmit(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-oe-primary/30 text-oe-primary text-xs font-medium hover:bg-oe-primary hover:text-white transition-colors">
                <Home size={13} />Request Work From Home
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
                <h2 className="text-base font-bold text-oe-text">Request Work From Home</h2>
                <p className="text-xs text-oe-muted mt-0.5">Will be sent to your immediate supervisor</p>
              </div>
              <button onClick={() => setShowSubmit(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-oe-muted">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-oe-text mb-1.5">Date</label>
                <input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  min={todayStr()} className="input w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-oe-text mb-1.5">Reason</label>
                <select value={form.reasonOption}
                  onChange={e => setForm(f => ({ ...f, reasonOption: e.target.value, reasonOther: '' }))}
                  className="input w-full" required>
                  <option value="">Select a reason...</option>
                  {WFH_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              {form.reasonOption === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-oe-text mb-1.5">Please specify</label>
                  <textarea value={form.reasonOther}
                    onChange={e => setForm(f => ({ ...f, reasonOther: e.target.value }))}
                    rows={3} placeholder="Describe your reason..." className="input w-full resize-none" autoFocus required />
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-2">
                <AlertTriangle size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Your request will be reviewed by your immediate supervisor.</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowSubmit(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-oe-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-oe-primary/90 transition-colors disabled:opacity-60">
                  {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Home size={15} />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
