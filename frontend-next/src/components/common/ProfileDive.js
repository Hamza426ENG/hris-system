import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { attendanceAPI, employeesAPI, leavesAPI } from '@/services/api';
import {
  LogIn, LogOut, Calendar, User, Building2,
  CheckCircle2, Briefcase, TrendingUp, ChevronRight,
  RotateCcw, Hash, Fingerprint, Clock,
  ClipboardList, TicketCheck, Mail, Shield
} from 'lucide-react';

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtElapsed(checkInISO) {
  const diff = Math.floor((Date.now() - new Date(checkInISO).getTime()) / 1000);
  if (diff < 0) return '0m';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const ROLE_STYLE = 'bg-white/15 text-white/90 border border-white/20';
const fmtRole = (r) => r ? r.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';

function Initials({ name, avatarUrl, size = 'lg' }) {
  const initials = (name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const dims = size === 'xl' ? 'w-14 h-14 text-lg' : size === 'lg' ? 'w-12 h-12 text-lg' : 'w-9 h-9 text-sm';
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${dims} rounded-full object-cover ring-2 ring-white/25`} />;
  }
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold text-white bg-white/15 backdrop-blur-sm ring-2 ring-white/20 flex-shrink-0`}>
      {initials || <User size={18} />}
    </div>
  );
}

function BalanceRow({ label, used, total, color }) {
  const available = total - used;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const colors = {
    blue:   { bar: 'bg-oe-primary',  text: 'text-oe-primary' },
    green:  { bar: 'bg-oe-success',  text: 'text-oe-success' },
    yellow: { bar: 'bg-oe-warning',  text: 'text-oe-warning' },
    purple: { bar: 'bg-oe-purple',   text: 'text-oe-purple' },
    cyan:   { bar: 'bg-oe-cyan',     text: 'text-oe-cyan' },
    danger: { bar: 'bg-oe-danger',   text: 'text-oe-danger' },
  };
  const c = colors[color] || colors.blue;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-oe-muted">{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${c.text}`}>
          {available}<span className="text-oe-muted font-normal">/{total}d</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-oe-border/40 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${c.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, color = 'text-oe-primary', bg = 'bg-oe-primary/10', onClick }) {
  return (
    <div
      className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-all duration-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:shadow-sm hover:scale-[1.02] ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
      onClick={onClick}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon size={14} className={color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-oe-text leading-none">{value}</div>
        <div className="text-[10px] text-oe-muted leading-tight mt-0.5">{label}</div>
      </div>
    </div>
  );
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

// ── main component ───────────────────────────────────────────────────────────

export default function ProfileDive({ stats, recentLeaves, myTicketCount }) {
  const { user } = useAuth();
  const router = useRouter();

  const [flipped, setFlipped] = useState(false);
  const [now, setNow] = useState(new Date());
  const [attendance, setAttendance] = useState(null);
  const [attLoading, setAttLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [balances, setBalances] = useState([]);
  const mountedRef = useRef(true);

  // Height measurement refs
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const [frontH, setFrontH] = useState(0);
  const [backH, setBackH] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadData = useCallback(async () => {
    if (!user?.employeeId) { setAttLoading(false); return; }
    try {
      const [attRes, empRes, balRes] = await Promise.allSettled([
        attendanceAPI.today(),
        employeesAPI.get(user.employeeId),
        leavesAPI.balances(user.employeeId),
      ]);
      if (!mountedRef.current) return;
      if (attRes.status === 'fulfilled') setAttendance(attRes.value.data.record);
      if (empRes.status === 'fulfilled') setEmployee(empRes.value.data);
      if (balRes.status === 'fulfilled') setBalances(balRes.value.data || []);
    } catch { /* non-fatal */ }
    finally { if (mountedRef.current) setAttLoading(false); }
  }, [user?.employeeId]);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => { mountedRef.current = false; };
  }, [loadData]);

  // Measure face heights after render
  useLayoutEffect(() => {
    const measure = () => {
      if (frontRef.current) setFrontH(frontRef.current.scrollHeight);
      if (backRef.current) setBackH(backRef.current.scrollHeight);
    };
    measure();
    // Re-measure when data loads
    const id = setTimeout(measure, 100);
    return () => clearTimeout(id);
  }, [employee, balances, recentLeaves, stats, attendance, attLoading]);

  const handleCheckIn = async (e) => {
    e.stopPropagation();
    setActionLoading(true);
    try { const res = await attendanceAPI.checkIn(); setAttendance(res.data.record); }
    catch (err) { console.error('Check-in failed', err); }
    finally { setActionLoading(false); }
  };

  const handleCheckOut = async (e) => {
    e.stopPropagation();
    setActionLoading(true);
    try { const res = await attendanceAPI.checkOut(); setAttendance(res.data.record); }
    catch (err) { console.error('Check-out failed', err); }
    finally { setActionLoading(false); }
  };

  if (!user) return null;

  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  const checkedIn  = attendance?.check_in && !attendance?.check_out;
  const checkedOut = attendance?.check_in && attendance?.check_out;

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const balanceColors = ['blue', 'green', 'yellow', 'purple', 'cyan', 'danger'];

  const statusBadge = (s) => {
    const map = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', cancelled: 'badge-inactive' };
    return <span className={map[s] || 'badge-inactive'}>{s}</span>;
  };

  const activeH = flipped ? backH : frontH;

  return (
    <div
      className="w-full cursor-pointer"
      style={{ perspective: '1200px' }}
      onClick={() => setFlipped(f => !f)}
    >
      {/* Outer wrapper: animated height so it grows/shrinks smoothly on flip */}
      <div
        className="relative overflow-hidden transition-[height] duration-700 ease-in-out"
        style={{ height: activeH || 'auto' }}
      >
        {/* Inner rotator — both faces positioned absolutely so they don't affect each other's height */}
        <div
          className="absolute inset-0 transition-transform duration-700 ease-in-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* ━━━━━━━━━━━━━ FRONT FACE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div
            ref={frontRef}
            className="absolute top-0 left-0 w-full rounded-xl overflow-hidden shadow-sm border border-oe-border"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Gradient Header */}
            <div className="gradient-bg px-5 pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ROLE_STYLE}`}>
                  {fmtRole(user.role)}
                </span>
                <div className="text-right">
                  <div className="text-white/90 text-[11px] font-mono tracking-wider tabular-nums">{timeStr}</div>
                  <div className="text-white/50 text-[10px]">{dateStr}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Initials name={fullName} avatarUrl={user.avatarUrl} size="xl" />
                <div className="min-w-0 flex-1">
                  <div className="text-white/60 text-[11px] font-medium tracking-wide">{greeting()}</div>
                  <div className="text-white font-bold text-lg leading-tight mt-0.5 break-words">{fullName}</div>
                  {employee?.department_name ? (
                    <div className="flex items-center gap-1.5 text-white/50 text-xs mt-1">
                      <Building2 size={11} className="flex-shrink-0" />
                      <span className="break-words">{employee.department_name}{employee?.position_title ? ` · ${employee.position_title}` : ''}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-white/50 text-xs mt-1">
                      <Shield size={11} className="flex-shrink-0" />
                      <span className="break-words">{fmtRole(user.role)} · {user.email}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Attendance Strip */}
            <div className="bg-oe-card px-5 py-3">
              {attLoading ? (
                <div className="flex items-center justify-center h-9">
                  <div className="w-4 h-4 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {!attendance && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-oe-muted">
                        <span className="w-1.5 h-1.5 rounded-full bg-oe-muted/40" />
                        Not checked in
                      </span>
                    )}
                    {checkedIn && (
                      <div className="flex items-center gap-1.5 text-oe-success text-sm font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-oe-success animate-pulse flex-shrink-0" />
                        Working
                        <span className="text-oe-muted font-normal text-xs">since {fmtTime(attendance.check_in)}</span>
                      </div>
                    )}
                    {checkedOut && (
                      <div className="flex items-center gap-1.5 text-oe-success/80 text-sm font-medium">
                        <CheckCircle2 size={13} className="flex-shrink-0" />
                        <span>{parseFloat(attendance.work_hours || 0).toFixed(1)}h logged</span>
                      </div>
                    )}
                  </div>

                  {checkedIn && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-mono font-bold text-oe-text tabular-nums leading-none">
                        {fmtElapsed(attendance.check_in)}
                      </div>
                    </div>
                  )}

                  <div className="flex-shrink-0">
                    {(!attendance || checkedOut) && (
                      <button onClick={handleCheckIn} disabled={actionLoading} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-oe-success text-white text-xs font-semibold hover:bg-oe-success/90 disabled:opacity-50 transition-colors">
                        {actionLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogIn size={13} />}
                        Check In
                      </button>
                    )}
                    {checkedIn && (
                      <button onClick={handleCheckOut} disabled={actionLoading} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-oe-warning/90 text-white text-xs font-semibold hover:bg-oe-warning disabled:opacity-50 transition-colors">
                        {actionLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogOut size={13} />}
                        Check Out
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Stats Grid — no extra borders, seamless */}
            <div className="bg-oe-card px-5 pb-3 pt-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <MiniStat icon={Calendar} label="Leaves Allocated" value={stats?.leavesAllocated || 0} color="text-oe-primary" bg="bg-oe-primary/10" />
                <MiniStat icon={Clock} label="Leaves Used" value={stats?.leavesUsed || 0} color="text-oe-warning" bg="bg-oe-warning/10" onClick={(e) => { e.stopPropagation(); router.push('/leaves'); }} />
                <MiniStat icon={ClipboardList} label="Pending Requests" value={stats?.pendingRequests || 0} color="text-oe-purple" bg="bg-oe-purple/10" onClick={(e) => { e.stopPropagation(); router.push('/leaves'); }} />
                <MiniStat icon={Fingerprint} label="Days Present" value={stats?.daysPresent || 0} color="text-oe-success" bg="bg-oe-success/10" onClick={(e) => { e.stopPropagation(); router.push('/attendance'); }} />
                <MiniStat
                  icon={CheckCircle2}
                  label="Today"
                  value={stats?.checkedInToday ? (stats?.checkedOutToday ? 'Done' : 'In') : 'Not Yet'}
                  color={stats?.checkedInToday ? 'text-oe-success' : 'text-oe-danger'}
                  bg={stats?.checkedInToday ? 'bg-oe-success/10' : 'bg-oe-danger/10'}
                  onClick={(e) => { e.stopPropagation(); router.push('/attendance'); }}
                />
                <MiniStat icon={TicketCheck} label="My Tickets" value={myTicketCount || 0} color="text-oe-cyan" bg="bg-oe-cyan/10" onClick={(e) => { e.stopPropagation(); router.push('/tickets'); }} />
              </div>
            </div>

            {/* Footer — compact, no heavy border */}
            <div className="bg-oe-card px-5 py-2 flex items-center justify-between">
              <button onClick={(e) => { e.stopPropagation(); router.push('/attendance'); }} className="flex items-center gap-1.5 text-[11px] text-oe-primary font-medium hover:underline">
                <Fingerprint size={11} /> View Attendance
              </button>
              <div className="flex items-center gap-1.5">
                <RotateCcw size={10} className="text-oe-muted/60" />
                <span className="text-[10px] text-oe-muted/60 tracking-wide">Tap to flip</span>
              </div>
            </div>
          </div>

          {/* ━━━━━━━━━━━━━ BACK FACE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div
            ref={backRef}
            className="absolute top-0 left-0 w-full rounded-xl overflow-hidden shadow-sm border border-oe-border"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            {/* Mini Header */}
            <div className="gradient-bg px-5 py-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Initials name={fullName} avatarUrl={user.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <div className="text-white font-semibold text-sm break-words">{fullName}</div>
                    <div className="text-white/50 text-[11px]">{employee?.employee_id || 'N/A'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-white/50 text-[10px] flex-shrink-0">
                  <RotateCcw size={10} />
                  <span>Tap to flip</span>
                </div>
              </div>
            </div>

            {/* Admin info — shown when no employee record is linked */}
            {!user.employeeId && (
              <div className="bg-oe-card px-5 py-3.5">
                <div className="text-[10px] font-semibold text-oe-muted uppercase tracking-wider mb-2.5">Account Info</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <div className="flex items-center gap-2 col-span-2">
                    <div className="w-6 h-6 rounded-md bg-oe-warning/8 flex items-center justify-center flex-shrink-0">
                      <Mail size={12} className="text-oe-warning" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-oe-muted uppercase tracking-wider leading-tight">Email</div>
                      <div className="text-xs font-medium text-oe-text break-all">{user.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-oe-primary/8 flex items-center justify-center flex-shrink-0">
                      <Shield size={12} className="text-oe-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-oe-muted uppercase tracking-wider leading-tight">Role</div>
                      <div className="text-xs font-medium text-oe-text">{fmtRole(user.role)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-oe-success/8 flex items-center justify-center flex-shrink-0">
                      <User size={12} className="text-oe-success" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-oe-muted uppercase tracking-wider leading-tight">Account Type</div>
                      <div className="text-xs font-medium text-oe-text">System Account</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Employee Details Grid — only shown when employee record exists */}
            {user.employeeId && <div className="bg-oe-card px-5 py-3.5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {employee?.position_title && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-oe-primary/8 flex items-center justify-center flex-shrink-0">
                      <Briefcase size={12} className="text-oe-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-oe-muted uppercase tracking-wider leading-tight">Position</div>
                      <div className="text-xs font-medium text-oe-text break-words leading-snug">{employee.position_title}</div>
                    </div>
                  </div>
                )}
                {employee?.department_name && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-oe-purple/8 flex items-center justify-center flex-shrink-0">
                      <Building2 size={12} className="text-oe-purple" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-oe-muted uppercase tracking-wider leading-tight">Department</div>
                      <div className="text-xs font-medium text-oe-text break-words leading-snug">{employee.department_name}</div>
                    </div>
                  </div>
                )}
                {employee?.employee_id && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-oe-cyan/8 flex items-center justify-center flex-shrink-0">
                      <Hash size={12} className="text-oe-cyan" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-oe-muted uppercase tracking-wider leading-tight">Employee ID</div>
                      <div className="text-xs font-medium text-oe-text">{employee.employee_id}</div>
                    </div>
                  </div>
                )}
                {employee?.hire_date && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-oe-success/8 flex items-center justify-center flex-shrink-0">
                      <Calendar size={12} className="text-oe-success" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-oe-muted uppercase tracking-wider leading-tight">Joined</div>
                      <div className="text-xs font-medium text-oe-text">
                        {new Date(employee.hire_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                )}
                {employee?.work_email && (
                  <div className="flex items-center gap-2 col-span-2">
                    <div className="w-6 h-6 rounded-md bg-oe-warning/8 flex items-center justify-center flex-shrink-0">
                      <Mail size={12} className="text-oe-warning" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-oe-muted uppercase tracking-wider leading-tight">Email</div>
                      <div className="text-xs font-medium text-oe-text break-all leading-snug">{employee.work_email}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>}

            {/* Leave Balances */}
            {balances.length > 0 && (
              <div className="bg-oe-card px-5 py-3 border-t border-oe-border/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-oe-muted uppercase tracking-wider">Leave Balances</span>
                  <button onClick={(e) => { e.stopPropagation(); router.push('/leaves'); }} className="text-[10px] text-oe-primary hover:underline">
                    View all
                  </button>
                </div>
                <div className="space-y-2">
                  {balances.slice(0, 6).map((b, i) => (
                    <BalanceRow
                      key={b.leave_type_id || i}
                      label={b.leave_type_name || b.name}
                      used={parseInt(b.used_days || 0)}
                      total={parseInt(b.allocated_days || 0)}
                      color={balanceColors[i % balanceColors.length]}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Leaves */}
            {recentLeaves && recentLeaves.length > 0 && (
              <div className="bg-oe-card px-5 py-3 border-t border-oe-border/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-oe-muted uppercase tracking-wider">Recent Leaves</span>
                  <button onClick={(e) => { e.stopPropagation(); router.push('/leaves'); }} className="text-[10px] text-oe-primary hover:underline">
                    View all
                  </button>
                </div>
                <div className="space-y-1.5">
                  {recentLeaves.slice(0, 4).map(l => (
                    <div key={l.id} className="flex items-center justify-between py-1.5 border-b border-oe-border/30 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-oe-text">{l.leave_type_name}</div>
                        <div className="text-[10px] text-oe-muted">{fmtDate(l.start_date)} — {fmtDate(l.end_date)} · {l.total_days}d</div>
                      </div>
                      <div className="flex-shrink-0 ml-2">{statusBadge(l.status)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View Profile CTA */}
            <div className="bg-oe-card border-t border-oe-border/40 px-5 py-2.5">
              <button
                onClick={(e) => { e.stopPropagation(); router.push('/profile'); }}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-oe-primary font-medium hover:underline py-0.5"
              >
                <TrendingUp size={12} />
                View full profile
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
