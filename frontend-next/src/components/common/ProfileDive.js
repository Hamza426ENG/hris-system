import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { attendanceAPI, employeesAPI, leavesAPI } from '@/services/api';
import {
  LogIn, LogOut, Calendar, User, Building2,
  CheckCircle2, Briefcase, TrendingUp, ChevronRight,
  RotateCcw, Hash, MapPin
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

const ROLE_STYLES = {
  super_admin: 'bg-white/15 text-white/90 border border-white/20',
  hr_admin:    'bg-white/15 text-white/90 border border-white/20',
  manager:     'bg-white/15 text-white/90 border border-white/20',
  team_lead:   'bg-white/15 text-white/90 border border-white/20',
  employee:    'bg-white/15 text-white/90 border border-white/20',
};

const ROLE_LABELS = {
  super_admin: 'Admin',
  hr_admin: 'HR Admin',
  manager: 'Manager',
  team_lead: 'Team Lead',
  employee: 'Employee',
};

// ── initials avatar ──────────────────────────────────────────────────────────

function Initials({ name, avatarUrl, size = 'lg' }) {
  const initials = (name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const dims = size === 'xl' ? 'w-16 h-16 text-xl' : size === 'lg' ? 'w-12 h-12 text-lg' : 'w-9 h-9 text-sm';
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${dims} rounded-full object-cover ring-2 ring-white/25`} />;
  }
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold text-white bg-white/15 backdrop-blur-sm ring-2 ring-white/20 flex-shrink-0`}>
      {initials || <User size={18} />}
    </div>
  );
}

// ── leave balance bar ────────────────────────────────────────────────────────

function BalanceRow({ label, used, total, color }) {
  const available = total - used;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const colors = {
    blue:   { bar: 'bg-oe-primary',  text: 'text-oe-primary' },
    green:  { bar: 'bg-oe-success',  text: 'text-oe-success' },
    yellow: { bar: 'bg-oe-warning',  text: 'text-oe-warning' },
    purple: { bar: 'bg-oe-purple',   text: 'text-oe-purple' },
  };
  const c = colors[color] || colors.blue;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-oe-muted truncate">{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${c.text}`}>
          {available}<span className="text-oe-muted font-normal">/{total}d</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-oe-border/40 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${c.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function ProfileDive() {
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

  // ── live clock ────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── data fetch ────────────────────────────────────────────────────────────
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

  // ── actions ───────────────────────────────────────────────────────────────
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

  const displayBalances = balances.slice(0, 4);
  const balanceColors = ['blue', 'green', 'yellow', 'purple'];

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="w-full cursor-pointer"
      style={{ perspective: '1200px' }}
      onClick={() => setFlipped(f => !f)}
    >
      {/* grid-stacking: both faces in the same cell so container height = max(front, back) */}
      <div
        className="transition-transform duration-700 ease-in-out"
        style={{
          display: 'grid',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ━━━━━━━━━━━━━ FRONT FACE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div
          className="w-full rounded-xl overflow-hidden shadow-sm border border-oe-border"
          style={{ gridArea: '1/1', backfaceVisibility: 'hidden' }}
        >
          {/* gradient header — avatar centered, minimal info */}
          <div className="gradient-bg px-6 pt-6 pb-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ROLE_STYLES[user.role] || ROLE_STYLES.employee}`}>
                  {ROLE_LABELS[user.role] || user.role}
                </span>
              </div>
              <div className="text-right">
                <div className="text-white/90 text-[11px] font-mono tracking-wider tabular-nums">{timeStr}</div>
                <div className="text-white/50 text-[10px]">{dateStr}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Initials name={fullName} avatarUrl={user.avatarUrl} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="text-white/60 text-[11px] font-medium tracking-wide">{greeting()}</div>
                <div className="text-white font-bold text-xl leading-tight truncate mt-0.5">{fullName}</div>
                {employee?.department_name && (
                  <div className="flex items-center gap-1.5 text-white/50 text-xs mt-1.5">
                    <Building2 size={11} />
                    <span>{employee.department_name}</span>
                    {employee?.position_title && (
                      <>
                        <span className="text-white/30">·</span>
                        <span>{employee.position_title}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* attendance strip */}
          <div className="bg-oe-card px-6 py-3.5">
            {attLoading ? (
              <div className="flex items-center justify-center h-10">
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
                    <div>
                      <div className="flex items-center gap-1.5 text-oe-success text-sm font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-oe-success animate-pulse" />
                        Working
                        <span className="text-oe-muted font-normal text-xs ml-1">since {fmtTime(attendance.check_in)}</span>
                      </div>
                    </div>
                  )}
                  {checkedOut && (
                    <div className="flex items-center gap-1.5 text-oe-success/80 text-sm font-medium">
                      <CheckCircle2 size={13} />
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
                  {!attendance && (
                    <button
                      onClick={handleCheckIn}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-oe-success text-white text-xs font-semibold hover:bg-oe-success/90 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogIn size={13} />}
                      Check In
                    </button>
                  )}
                  {checkedIn && (
                    <button
                      onClick={handleCheckOut}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-oe-warning/90 text-white text-xs font-semibold hover:bg-oe-warning disabled:opacity-50 transition-colors"
                    >
                      {actionLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogOut size={13} />}
                      Check Out
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* tap hint */}
          <div className="bg-oe-card border-t border-oe-border/50 px-6 py-2 flex items-center justify-center gap-1.5">
            <RotateCcw size={10} className="text-oe-muted/60" />
            <span className="text-[10px] text-oe-muted/60 tracking-wide">Tap to see details</span>
          </div>
        </div>

        {/* ━━━━━━━━━━━━━ BACK FACE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div
          className="w-full rounded-xl overflow-hidden shadow-sm border border-oe-border"
          style={{ gridArea: '1/1', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {/* mini header */}
          <div className="gradient-bg px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Initials name={fullName} avatarUrl={user.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <div className="text-white font-semibold text-sm truncate">{fullName}</div>
                  <div className="text-white/50 text-[11px]">{employee?.employee_id || 'N/A'}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-white/50 text-[10px]">
                <RotateCcw size={10} />
                <span>Tap to flip</span>
              </div>
            </div>
          </div>

          {/* details grid — two columns */}
          <div className="bg-oe-card px-6 py-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {employee?.position_title && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-oe-primary/8 flex items-center justify-center flex-shrink-0">
                    <Briefcase size={13} className="text-oe-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-oe-muted uppercase tracking-wider">Position</div>
                    <div className="text-xs font-medium text-oe-text truncate">{employee.position_title}</div>
                  </div>
                </div>
              )}
              {employee?.department_name && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-oe-purple/8 flex items-center justify-center flex-shrink-0">
                    <Building2 size={13} className="text-oe-purple" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-oe-muted uppercase tracking-wider">Department</div>
                    <div className="text-xs font-medium text-oe-text truncate">{employee.department_name}</div>
                  </div>
                </div>
              )}
              {employee?.employee_id && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-oe-cyan/8 flex items-center justify-center flex-shrink-0">
                    <Hash size={13} className="text-oe-cyan" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-oe-muted uppercase tracking-wider">Employee ID</div>
                    <div className="text-xs font-medium text-oe-text">{employee.employee_id}</div>
                  </div>
                </div>
              )}
              {employee?.hire_date && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-oe-success/8 flex items-center justify-center flex-shrink-0">
                    <Calendar size={13} className="text-oe-success" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-oe-muted uppercase tracking-wider">Joined</div>
                    <div className="text-xs font-medium text-oe-text">
                      {new Date(employee.hire_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                    </div>
                  </div>
                </div>
              )}
              {employee?.work_email && (
                <div className="flex items-center gap-2.5 col-span-2">
                  <div className="w-7 h-7 rounded-lg bg-oe-warning/8 flex items-center justify-center flex-shrink-0">
                    <MapPin size={13} className="text-oe-warning" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-oe-muted uppercase tracking-wider">Email</div>
                    <div className="text-xs font-medium text-oe-text truncate">{employee.work_email}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* leave balances */}
          {displayBalances.length > 0 && (
            <div className="bg-oe-card px-6 py-3.5 border-t border-oe-border/40">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-semibold text-oe-muted uppercase tracking-wider">Leave Balances</span>
                <button
                  onClick={(e) => { e.stopPropagation(); router.push('/leaves'); }}
                  className="text-[10px] text-oe-primary hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {displayBalances.map((b, i) => (
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

          {/* view profile CTA */}
          <div className="bg-oe-card border-t border-oe-border/40 px-6 py-2.5">
            <button
              onClick={(e) => { e.stopPropagation(); user.employeeId && router.push(`/employees/${user.employeeId}`); }}
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
  );
}
