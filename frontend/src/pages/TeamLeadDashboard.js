import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamAPI, leavesAPI } from '../services/api';
import Avatar from '../components/Avatar';
import {
  Users, Calendar, Clock, CheckCircle, XCircle, AlertCircle,
  ChevronRight, LogIn, LogOut, Gift, UserPlus, Building2, Briefcase
} from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
const calcTenure = (hireDate) => {
  if (!hireDate) return '—';
  const months = Math.floor((Date.now() - new Date(hireDate)) / (1000 * 60 * 60 * 24 * 30.44));
  return months < 12 ? `${months}mo` : `${(months / 12).toFixed(1)}yr`;
};

const StatCard = ({ icon: Icon, label, value, sub, color = 'primary' }) => (
  <div className="stat-card">
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        color === 'primary' ? 'bg-oe-primary/10 text-oe-primary' :
        color === 'success' ? 'bg-oe-success/10 text-oe-success' :
        color === 'warning' ? 'bg-oe-warning/10 text-oe-warning' :
        color === 'danger'  ? 'bg-oe-danger/10 text-oe-danger'   :
        'bg-oe-purple/10 text-oe-purple'
      }`}><Icon size={20} /></div>
    </div>
    <div className="text-2xl font-bold text-oe-text mb-0.5">{value}</div>
    <div className="text-sm font-medium text-oe-text mb-1">{label}</div>
    {sub && <div className="text-xs text-oe-muted">{sub}</div>}
  </div>
);

export default function TeamLeadDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState(null);
  const [activeTab, setActiveTab] = useState('members');

  const load = useCallback(async () => {
    try {
      const res = await teamAPI.stats();
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLeave = async (leaveId, action) => {
    setApprovingId(leaveId);
    try {
      if (action === 'approve') await leavesAPI.approve(leaveId, { comment: 'Approved by manager' });
      else await leavesAPI.reject(leaveId, { comment: 'Rejected by manager' });
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
    finally { setApprovingId(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data?.self) return (
    <div className="card p-8 text-center text-oe-muted">
      <Users size={40} className="mx-auto mb-3 opacity-30" />
      <p className="font-medium text-oe-text">No employee profile linked to your account</p>
      <p className="text-sm mt-1">Contact your administrator.</p>
    </div>
  );

  const { self, team, members, pendingLeaves, leaveBalanceSummary, todayAttendance, upcomingBirthdays, recentHires, leaveSummary } = data;

  const TABS = [
    { id: 'members',    label: 'Team Members', count: members.length },
    { id: 'attendance', label: "Today's Attendance", count: team.checkedInToday },
    { id: 'leaves',     label: 'Leave Requests', count: pendingLeaves.length, badge: pendingLeaves.length > 0 },
    { id: 'activity',   label: 'Recent Activity' },
  ];

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-oe-text">My Team Dashboard</h1>
          <p className="text-sm text-oe-muted">{self.department_name} · {self.position_title}</p>
        </div>
        <button onClick={() => navigate('/employees')} className="btn-secondary self-start sm:self-auto">
          <Users size={14} /> View All Employees <ChevronRight size={13} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}    label="Direct Reports"  value={team.total}             sub={`${team.active} active`}              color="primary" />
        <StatCard icon={CheckCircle} label="Checked In Today" value={team.checkedInToday} sub={`of ${team.active} active`}           color="success" />
        <StatCard icon={Calendar} label="On Leave"        value={team.onLeave}           sub="currently"                            color="warning" />
        <StatCard icon={AlertCircle} label="Pending Leaves" value={team.pendingLeaveCount} sub="awaiting your approval"             color="danger" />
      </div>

      {/* Department card */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center flex-shrink-0">
              <Building2 size={22} className="text-white" />
            </div>
            <div>
              <div className="font-bold text-oe-text text-lg">{self.department_name}</div>
              <div className="text-sm text-oe-muted">Code: {self.department_code} · {self.dept_headcount} total members</div>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <div className="text-xl font-bold text-oe-primary">{team.total}</div>
              <div className="text-xs text-oe-muted">Your Reports</div>
            </div>
            <div>
              <div className="text-xl font-bold text-oe-success">{team.active}</div>
              <div className="text-xs text-oe-muted">Active</div>
            </div>
            <div>
              <div className="text-xl font-bold text-oe-warning">{team.onLeave}</div>
              <div className="text-xs text-oe-muted">On Leave</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <div className="flex gap-1 bg-oe-surface rounded-xl p-1 w-max sm:w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`relative flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-oe-card text-oe-text shadow' : 'text-oe-muted hover:text-oe-text'}`}>
              {t.label}
              {t.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${t.badge ? 'bg-oe-danger text-white' : 'bg-oe-primary/10 text-oe-primary'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Team Members ── */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          {members.length === 0 ? (
            <div className="card p-8 text-center text-oe-muted">No direct reports assigned yet.</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="card p-0 overflow-hidden hidden md:block">
                <table className="w-full">
                  <thead className="bg-oe-surface/50">
                    <tr>{['Employee', 'Position', 'Status', 'Tenure', 'Pending Leaves', 'Actions'].map(h => (
                      <th key={h} className="table-header">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.id} className="table-row">
                        <td className="table-cell">
                          <div className="flex items-center gap-3">
                            <Avatar src={m.avatar_url} firstName={m.first_name} lastName={m.last_name} size={36} />
                            <div>
                              <div className="font-medium text-oe-text text-sm">{m.first_name} {m.last_name}</div>
                              <div className="text-xs text-oe-muted">{m.employee_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="table-cell">
                          <div className="text-sm text-oe-text">{m.position_title || '—'}</div>
                          {m.grade && <div className="text-xs text-oe-muted">Grade {m.grade}</div>}
                        </td>
                        <td className="table-cell">
                          <span className={m.status === 'active' ? 'badge-active' : m.status === 'on_leave' ? 'badge-pending' : 'badge-inactive'}>
                            {m.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="table-cell text-sm text-oe-muted">{calcTenure(m.hire_date)}</td>
                        <td className="table-cell">
                          {parseInt(m.pending_leaves) > 0 ? (
                            <span className="badge-pending">{m.pending_leaves} pending</span>
                          ) : <span className="text-oe-muted text-xs">—</span>}
                        </td>
                        <td className="table-cell">
                          <button onClick={() => navigate(`/employees/${m.id}`)}
                            className="text-oe-primary hover:underline text-xs font-medium">
                            View Profile
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {members.map(m => (
                  <div key={m.id} className="card p-4 flex items-center gap-3" onClick={() => navigate(`/employees/${m.id}`)}>
                    <Avatar src={m.avatar_url} firstName={m.first_name} lastName={m.last_name} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-oe-text">{m.first_name} {m.last_name}</div>
                      <div className="text-xs text-oe-muted">{m.position_title} · {calcTenure(m.hire_date)}</div>
                      <div className="flex gap-2 mt-1">
                        <span className={m.status === 'active' ? 'badge-active' : 'badge-pending'}>{m.status?.replace('_', ' ')}</span>
                        {parseInt(m.pending_leaves) > 0 && <span className="badge-pending">{m.pending_leaves} pending leave</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-oe-muted flex-shrink-0" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Today's Attendance ── */}
      {activeTab === 'attendance' && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-oe-border bg-oe-surface/30">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-oe-success font-medium">
                <LogIn size={14} />{todayAttendance.filter(a => a.check_in).length} Checked In
              </span>
              <span className="flex items-center gap-1.5 text-oe-danger font-medium">
                <LogOut size={14} />{todayAttendance.filter(a => a.check_out).length} Checked Out
              </span>
              <span className="flex items-center gap-1.5 text-oe-muted">
                <Clock size={14} />{todayAttendance.filter(a => !a.check_in).length} Not Yet
              </span>
            </div>
          </div>
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>{['Employee', 'Check In', 'Check Out', 'Hours', 'Status'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {todayAttendance.map(a => (
                <tr key={a.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <Avatar src={a.avatar_url} firstName={a.first_name} lastName={a.last_name} size={32} />
                      <span className="text-sm font-medium text-oe-text">{a.first_name} {a.last_name}</span>
                    </div>
                  </td>
                  <td className="table-cell text-sm text-oe-success font-medium">{fmtTime(a.check_in)}</td>
                  <td className="table-cell text-sm text-oe-danger font-medium">{fmtTime(a.check_out)}</td>
                  <td className="table-cell text-sm text-oe-muted">{a.hours_worked ? `${a.hours_worked}h` : '—'}</td>
                  <td className="table-cell">
                    {!a.check_in ? (
                      <span className="badge-inactive">Not checked in</span>
                    ) : !a.check_out ? (
                      <span className="badge-pending">Working</span>
                    ) : (
                      <span className="badge-approved">Complete</span>
                    )}
                  </td>
                </tr>
              ))}
              {todayAttendance.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-oe-muted">No attendance data for today.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Leave Requests ── */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          {pendingLeaves.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-oe-text flex items-center gap-2">
                <AlertCircle size={16} className="text-oe-danger" />
                Pending Approval ({pendingLeaves.length})
              </h3>
              {pendingLeaves.map(l => (
                <div key={l.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Avatar src={l.avatar_url} firstName={l.employee_name?.split(' ')[0]} lastName={l.employee_name?.split(' ')[1]} size={40} />
                    <div>
                      <div className="font-medium text-oe-text">{l.employee_name}</div>
                      <div className="text-sm text-oe-muted">{l.leave_type_name} · {fmtDate(l.start_date)} – {fmtDate(l.end_date)} ({l.total_days}d)</div>
                      {l.reason && <div className="text-xs text-oe-muted mt-0.5 italic">"{l.reason}"</div>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => handleLeave(l.id, 'approve')} disabled={approvingId === l.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-oe-success/10 text-oe-success hover:bg-oe-success hover:text-white transition-colors text-sm font-medium">
                      <CheckCircle size={14} />Approve
                    </button>
                    <button onClick={() => handleLeave(l.id, 'reject')} disabled={approvingId === l.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-oe-danger/10 text-oe-danger hover:bg-oe-danger hover:text-white transition-colors text-sm font-medium">
                      <XCircle size={14} />Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Leave balance summary */}
          {leaveBalanceSummary.length > 0 && (
            <div className="card p-5 space-y-3">
              <h3 className="font-semibold text-oe-text text-sm">Team Leave Usage (This Year)</h3>
              <div className="space-y-2.5">
                {leaveBalanceSummary.map((lb, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-oe-muted w-28 truncate">{lb.leave_type}</span>
                    <div className="flex-1 h-2 bg-oe-surface rounded-full overflow-hidden">
                      <div className="h-full bg-oe-primary rounded-full" style={{ width: `${Math.min(100, (lb.total_used / (lb.member_count * 15)) * 100)}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-oe-text w-20 text-right">{lb.total_used}d used · avg {lb.avg_remaining}d left</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent leave history */}
          {leaveSummary.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="p-4 border-b border-oe-border">
                <h3 className="font-semibold text-oe-text text-sm">Recent Leave History</h3>
              </div>
              <table className="w-full">
                <thead className="bg-oe-surface/50">
                  <tr>{['Employee', 'Type', 'Dates', 'Days', 'Status'].map(h => <th key={h} className="table-header">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {leaveSummary.map(l => (
                    <tr key={l.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <Avatar src={l.avatar_url} firstName={l.employee_name?.split(' ')[0]} lastName={l.employee_name?.split(' ')[1]} size={28} />
                          <span className="text-sm text-oe-text">{l.employee_name}</span>
                        </div>
                      </td>
                      <td className="table-cell text-sm text-oe-muted">{l.leave_type_name}</td>
                      <td className="table-cell text-xs text-oe-muted">{fmtDate(l.start_date)} – {fmtDate(l.end_date)}</td>
                      <td className="table-cell text-sm text-oe-text">{l.total_days}d</td>
                      <td className="table-cell">
                        <span className={l.status === 'approved' ? 'badge-approved' : l.status === 'pending' ? 'badge-pending' : l.status === 'rejected' ? 'badge-rejected' : 'badge-inactive'}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pendingLeaves.length === 0 && leaveSummary.length === 0 && (
            <div className="card p-8 text-center text-oe-muted">No leave requests for your team.</div>
          )}
        </div>
      )}

      {/* ── Recent Activity ── */}
      {activeTab === 'activity' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Recent Hires */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-oe-text flex items-center gap-2"><UserPlus size={16} className="text-oe-success" />New Team Members (Last 60 days)</h3>
            {recentHires.length === 0 ? (
              <p className="text-sm text-oe-muted text-center py-4">No new hires recently.</p>
            ) : recentHires.map(e => (
              <div key={e.id} className="flex items-center gap-3 cursor-pointer hover:bg-oe-surface rounded-lg p-1.5 -mx-1.5 transition-colors" onClick={() => navigate(`/employees/${e.id}`)}>
                <Avatar src={e.avatar_url} firstName={e.first_name} lastName={e.last_name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-oe-text">{e.first_name} {e.last_name}</div>
                  <div className="text-xs text-oe-muted">{e.position_title}</div>
                </div>
                <div className="text-xs text-oe-muted text-right">Joined {fmtDate(e.hire_date)}</div>
              </div>
            ))}
          </div>

          {/* Upcoming Birthdays */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-oe-text flex items-center gap-2"><Gift size={16} className="text-oe-warning" />Upcoming Birthdays</h3>
            {upcomingBirthdays.length === 0 ? (
              <p className="text-sm text-oe-muted text-center py-4">No birthdays in the next 30 days.</p>
            ) : upcomingBirthdays.map(e => (
              <div key={e.id} className="flex items-center gap-3">
                <Avatar src={e.avatar_url} firstName={e.first_name} lastName={e.last_name} size={36} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-oe-text">{e.first_name} {e.last_name}</div>
                  <div className="text-xs text-oe-muted">{fmtDate(e.date_of_birth)?.replace(/,\s*\d{4}/, '')}</div>
                </div>
                <span className="text-lg">🎂</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
