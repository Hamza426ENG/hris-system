import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { employeesAPI, leavesAPI, attendanceAPI, announcementsAPI, widgetsAPI } from '../services/api';
import Avatar from '../components/Avatar';
import { Clock, LogIn, LogOut, Calendar, Building2, UserCheck, Megaphone, ChevronRight, Briefcase, Phone, MapPin, Users } from 'lucide-react';

const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const calcTenure = (hireDate) => {
  if (!hireDate) return '—';
  const months = Math.floor((Date.now() - new Date(hireDate)) / (1000 * 60 * 60 * 24 * 30.44));
  return months < 12 ? `${months} mo` : `${(months / 12).toFixed(1)} yr`;
};
const calcAge = (dob) => {
  if (!dob) return '—';
  return `${Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25))} yr`;
};

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [manager, setManager] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [recentLeaves, setRecentLeaves] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.employeeId) { setLoading(false); return; }
    try {
      const [empRes, widRes] = await Promise.all([
        employeesAPI.get(user.employeeId),
        widgetsAPI.get(),
      ]);
      const emp = empRes.data;
      setProfile(emp);
      setWidgets(widRes.data.visible || []);

      // Parallel fetch based on visible widgets
      const visible = widRes.data.visible || [];
      const fetches = [];

      if (visible.includes('org_structure') && emp.manager_id) {
        fetches.push(employeesAPI.get(emp.manager_id).then(r => setManager(r.data)).catch(() => {}));
      }
      if (visible.includes('team_members')) {
        fetches.push(
          employeesAPI.list({ department: emp.department_id, status: 'active', limit: 20 })
            .then(r => setTeamMembers((r.data.data || []).filter(e => e.id !== emp.id)))
            .catch(() => {})
        );
      }
      if (visible.includes('leave_summary')) {
        fetches.push(
          leavesAPI.balances(user.employeeId, { year: new Date().getFullYear() })
            .then(r => setLeaveBalances(r.data || [])).catch(() => {}),
          leavesAPI.list({ employee_id: user.employeeId, limit: 5 })
            .then(r => setRecentLeaves(r.data.data || [])).catch(() => {})
        );
      }
      if (visible.includes('attendance')) {
        fetches.push(attendanceAPI.today().then(r => setAttendance(r.data.record)).catch(() => {}));
      }
      if (visible.includes('announcements')) {
        fetches.push(announcementsAPI.list().then(r => setAnnouncements((r.data || []).slice(0, 3))).catch(() => {}));
      }
      await Promise.all(fetches);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const res = await attendanceAPI.checkIn();
      setAttendance(res.data.record);
    } catch (err) { alert(err.response?.data?.error || 'Check-in failed'); }
    finally { setCheckingIn(false); }
  };

  const handleCheckOut = async () => {
    setCheckingOut(true);
    try {
      const res = await attendanceAPI.checkOut();
      setAttendance(res.data.record);
    } catch (err) { alert(err.response?.data?.error || 'Check-out failed'); }
    finally { setCheckingOut(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile) return (
    <div className="card p-8 text-center text-oe-muted">
      <UserCheck size={40} className="mx-auto mb-3 text-oe-primary/30" />
      <p className="font-medium text-oe-text">No employee profile linked</p>
      <p className="text-sm mt-1">Your account is not linked to an employee record. Contact HR to set this up.</p>
    </div>
  );

  const show = (key) => widgets.includes(key);

  return (
    <div className="space-y-5">
      {/* Top greeting */}
      <div>
        <h1 className="text-xl font-bold text-oe-text">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {profile.first_name}!</h1>
        <p className="text-sm text-oe-muted">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT: Profile Card */}
        {show('profile_summary') && (
          <div className="lg:col-span-1 space-y-4">
            <div className="card p-5 space-y-4">
              {/* Avatar + name */}
              <div className="flex flex-col items-center text-center gap-2 pb-4 border-b border-oe-border">
                <div className="relative">
                  <Avatar src={profile.avatar_url} firstName={profile.first_name} lastName={profile.last_name} size={80} className="ring-4 ring-oe-primary/20" />
                  <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${profile.status === 'active' ? 'bg-oe-success' : 'bg-oe-warning'}`} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-oe-text">{profile.first_name} {profile.last_name}</h2>
                  <p className="text-sm text-oe-primary font-medium">{profile.position_title || '—'}</p>
                  <p className="text-xs text-oe-muted">{profile.department_name || '—'}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-center">
                  <span className="text-xs px-2 py-0.5 bg-oe-primary/10 text-oe-primary rounded-full">{profile.employee_id}</span>
                  <span className="text-xs px-2 py-0.5 bg-oe-success/10 text-oe-success rounded-full capitalize">{profile.employment_type?.replace('_', ' ')}</span>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-oe-muted flex items-center gap-1.5"><Calendar size={13} />Joining Date</span>
                  <span className="text-oe-text font-medium">{fmtDate(profile.hire_date)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-oe-muted">Tenure</span>
                  <span className="text-oe-text font-medium">{calcTenure(profile.hire_date)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-oe-muted">Age</span>
                  <span className="text-oe-text font-medium">{calcAge(profile.date_of_birth)}</span>
                </div>
                {profile.phone_primary && (
                  <div className="flex items-center justify-between">
                    <span className="text-oe-muted flex items-center gap-1.5"><Phone size={13} />Cell</span>
                    <span className="text-oe-text font-medium">**{profile.phone_primary.slice(-5)}</span>
                  </div>
                )}
                {profile.emergency_contact_phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-oe-muted">Emergency</span>
                    <span className="text-oe-text font-medium">**{profile.emergency_contact_phone.slice(-5)}</span>
                  </div>
                )}
                {(profile.city || profile.country) && (
                  <div className="flex items-center justify-between">
                    <span className="text-oe-muted flex items-center gap-1.5"><MapPin size={13} />Location</span>
                    <span className="text-oe-text font-medium">{[profile.city, profile.country].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>

              <button onClick={() => navigate(`/employees/${profile.id}`)} className="w-full btn-secondary text-xs justify-center">
                View Full Profile <ChevronRight size={13} />
              </button>
            </div>

            {/* Attendance card */}
            {show('attendance') && (
              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={16} className="text-oe-primary" />
                  <h3 className="font-semibold text-oe-text text-sm">Today's Attendance</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-oe-success/5 border border-oe-success/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-oe-muted mb-1 flex items-center justify-center gap-1"><LogIn size={11} />Check In</div>
                    <div className="text-sm font-bold text-oe-success">{fmtTime(attendance?.check_in)}</div>
                  </div>
                  <div className="bg-oe-danger/5 border border-oe-danger/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-oe-muted mb-1 flex items-center justify-center gap-1"><LogOut size={11} />Check Out</div>
                    <div className="text-sm font-bold text-oe-danger">{fmtTime(attendance?.check_out)}</div>
                  </div>
                </div>

                {attendance?.hours_worked && (
                  <div className="text-center text-xs text-oe-muted">
                    Hours worked: <span className="font-semibold text-oe-text">{attendance.hours_worked}h</span>
                    {attendance.overtime_hours > 0 && <span className="text-oe-warning ml-1">+{attendance.overtime_hours}h OT</span>}
                  </div>
                )}

                <div className="flex gap-2">
                  {!attendance?.check_in ? (
                    <button onClick={handleCheckIn} disabled={checkingIn}
                      className="flex-1 btn-primary text-xs justify-center py-2">
                      <LogIn size={14} />{checkingIn ? 'Checking in...' : 'Check In'}
                    </button>
                  ) : !attendance?.check_out ? (
                    <button onClick={handleCheckOut} disabled={checkingOut}
                      className="flex-1 bg-oe-danger text-white rounded-lg px-3 py-2 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-red-700 transition-colors">
                      <LogOut size={14} />{checkingOut ? 'Checking out...' : 'Check Out'}
                    </button>
                  ) : (
                    <div className="flex-1 text-center text-xs text-oe-success font-medium py-2">Attendance complete</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MIDDLE: Team + Leave */}
        <div className="lg:col-span-1 space-y-4">

          {/* Leave Summary */}
          {show('leave_summary') && (
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-oe-purple" />
                  <h3 className="font-semibold text-oe-text text-sm">Leave Balance</h3>
                </div>
                <button onClick={() => navigate('/leaves')} className="text-xs text-oe-primary hover:underline flex items-center gap-0.5">
                  Manage <ChevronRight size={12} />
                </button>
              </div>

              {leaveBalances.length === 0 ? (
                <p className="text-xs text-oe-muted text-center py-2">No leave balances found</p>
              ) : (
                <div className="space-y-2">
                  {leaveBalances.slice(0, 4).map((lb) => (
                    <div key={lb.id} className="flex items-center justify-between">
                      <span className="text-xs text-oe-muted truncate max-w-[120px]">{lb.leave_type_name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-oe-surface rounded-full overflow-hidden">
                          <div className="h-full bg-oe-primary rounded-full"
                            style={{ width: `${lb.allocated_days > 0 ? Math.min(100, (lb.remaining_days / lb.allocated_days) * 100) : 0}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-oe-text w-12 text-right">
                          {lb.remaining_days}/{lb.allocated_days}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {recentLeaves.length > 0 && (
                <>
                  <div className="text-xs font-medium text-oe-muted pt-1 border-t border-oe-border">Recent Requests</div>
                  <div className="space-y-1.5">
                    {recentLeaves.slice(0, 3).map(l => (
                      <div key={l.id} className="flex items-center justify-between text-xs">
                        <span className="text-oe-muted truncate max-w-[130px]">{l.leave_type_name} · {fmtDate(l.start_date)}</span>
                        <span className={
                          l.status === 'approved' ? 'badge-approved' :
                          l.status === 'pending' ? 'badge-pending' :
                          l.status === 'rejected' ? 'badge-rejected' : 'badge-inactive'
                        }>{l.status}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Team Members */}
          {show('team_members') && (
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-oe-cyan" />
                  <h3 className="font-semibold text-oe-text text-sm">Department Team</h3>
                </div>
                <span className="text-xs text-oe-muted">{teamMembers.length} members</span>
              </div>

              {teamMembers.length === 0 ? (
                <p className="text-xs text-oe-muted text-center py-2">No team members found</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {teamMembers.slice(0, 10).map(m => (
                      <button key={m.id} onClick={() => navigate(`/employees/${m.id}`)}
                        title={`${m.first_name} ${m.last_name}`}
                        className="group relative">
                        <Avatar src={m.avatar_url} firstName={m.first_name} lastName={m.last_name} size={36}
                          className="ring-2 ring-white hover:ring-oe-primary transition-all" />
                      </button>
                    ))}
                    {teamMembers.length > 10 && (
                      <div className="w-9 h-9 rounded-full bg-oe-surface flex items-center justify-center text-xs font-semibold text-oe-muted ring-2 ring-white">
                        +{teamMembers.length - 10}
                      </div>
                    )}
                  </div>

                  {/* Team stats */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-oe-border">
                    <div className="text-center">
                      <div className="text-xs text-oe-muted">Avg Tenure</div>
                      <div className="text-sm font-bold text-oe-text">
                        {teamMembers.length > 0
                          ? `${(teamMembers.reduce((a, m) => a + (m.hire_date ? (Date.now() - new Date(m.hire_date)) / (1000 * 60 * 60 * 24 * 365.25) : 0), 0) / teamMembers.length).toFixed(1)} yr`
                          : '—'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-oe-muted">Team Size</div>
                      <div className="text-sm font-bold text-oe-text">{teamMembers.length + 1}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Org Structure + Announcements */}
        <div className="lg:col-span-1 space-y-4">

          {/* Org Structure */}
          {show('org_structure') && (
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-oe-warning" />
                <h3 className="font-semibold text-oe-text text-sm">Org Structure</h3>
              </div>

              {/* Manager */}
              {manager ? (
                <div className="space-y-3">
                  <div className="text-xs text-oe-muted uppercase tracking-wider font-medium">Your Manager</div>
                  <button onClick={() => navigate(`/employees/${manager.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-oe-purple/5 border border-oe-purple/20 hover:bg-oe-purple/10 transition-colors text-left">
                    <Avatar src={manager.avatar_url} firstName={manager.first_name} lastName={manager.last_name} size={44}
                      className="ring-2 ring-oe-purple/30" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-oe-text text-sm">{manager.first_name} {manager.last_name}</div>
                      <div className="text-xs text-oe-muted truncate">{manager.position_title || '—'}</div>
                      <div className="text-xs text-oe-muted truncate">{manager.department_name || '—'}</div>
                    </div>
                    <Briefcase size={14} className="text-oe-purple flex-shrink-0" />
                  </button>
                </div>
              ) : (
                <p className="text-xs text-oe-muted text-center py-1">No manager assigned</p>
              )}

              {/* Department */}
              <div className="space-y-2">
                <div className="text-xs text-oe-muted uppercase tracking-wider font-medium">Department</div>
                <div className="p-3 rounded-xl bg-oe-primary/5 border border-oe-primary/20 space-y-1">
                  <div className="font-semibold text-oe-text text-sm">{profile.department_name || '—'}</div>
                  <div className="text-xs text-oe-muted">{profile.department_code && `Code: ${profile.department_code}`}</div>
                  <div className="text-xs text-oe-muted">Position: <span className="text-oe-text">{profile.position_title || '—'}</span></div>
                  {profile.grade && <div className="text-xs text-oe-muted">Grade: <span className="text-oe-text">{profile.grade}</span></div>}
                </div>
              </div>

              <button onClick={() => navigate('/organogram')} className="w-full btn-secondary text-xs justify-center">
                View Organogram <ChevronRight size={13} />
              </button>
            </div>
          )}

          {/* Announcements */}
          {show('announcements') && announcements.length > 0 && (
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Megaphone size={16} className="text-oe-danger" />
                <h3 className="font-semibold text-oe-text text-sm">Announcements</h3>
              </div>
              <div className="space-y-2.5">
                {announcements.map(a => (
                  <div key={a.id} className={`p-3 rounded-lg border-l-4 ${
                    a.priority === 'high' ? 'border-oe-danger bg-red-50' :
                    a.priority === 'normal' ? 'border-oe-primary bg-blue-50' :
                    'border-oe-muted bg-oe-surface'
                  }`}>
                    <div className="font-medium text-oe-text text-sm">{a.title}</div>
                    <div className="text-xs text-oe-muted mt-0.5 line-clamp-2">{a.content}</div>
                    <div className="text-xs text-oe-muted mt-1">{fmtDate(a.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
