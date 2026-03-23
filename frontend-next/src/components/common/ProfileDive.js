import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { attendanceAPI, employeesAPI, leavesAPI } from '@/services/api';
import {
  LogIn, LogOut, Clock, Calendar, User, Building2,
  CheckCircle2, MapPin, Briefcase, Timer, TrendingUp
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

function roleBadge(role) {
  const map = {
    admin:    'bg-oe-danger/15 text-oe-danger border border-oe-danger/30',
    hr:       'bg-oe-purple/15 text-oe-purple border border-oe-purple/30',
    team_lead:'bg-oe-warning/15 text-oe-warning border border-oe-warning/30',
    employee: 'bg-oe-primary/15 text-oe-primary border border-oe-primary/30',
  };
  const labels = { admin: 'Admin', hr: 'HR', team_lead: 'Team Lead', employee: 'Employee' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[role] || map.employee}`}>
      {labels[role] || role}
    </span>
  );
}

// ── initials avatar ──────────────────────────────────────────────────────────

function Initials({ name, avatarUrl, size = 'lg' }) {
  const initials = (name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const sizeClass = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-base';
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${sizeClass} rounded-full object-cover ring-2 ring-oe-border`} />;
  }
  return (
    <div className={`${sizeClass} gradient-bg rounded-full flex items-center justify-center font-bold text-white ring-2 ring-oe-border flex-shrink-0`}>
      {initials || <User size={20} />}
    </div>
  );
}

// ── leave balance pill ───────────────────────────────────────────────────────

function BalancePill({ label, used, total, color }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const colorMap = {
    blue:   { bar: 'bg-oe-primary',  text: 'text-oe-primary' },
    green:  { bar: 'bg-oe-success',  text: 'text-oe-success' },
    yellow: { bar: 'bg-oe-warning',  text: 'text-oe-warning' },
    purple: { bar: 'bg-oe-purple',   text: 'text-oe-purple' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-oe-muted truncate">{label}</span>
        <span className={`text-xs font-semibold ${c.text}`}>{total - used}<span className="text-oe-muted font-normal">/{total}d</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-oe-border/50 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${c.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function ProfileDive() {
  const { user, permissions } = useAuth();
  const router = useRouter();

  const [now, setNow] = useState(new Date());
  const [attendance, setAttendance] = useState(null); // today's record
  const [attLoading, setAttLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [balances, setBalances] = useState([]);
  const mountedRef = useRef(true);

  // ── live clock (every second) ──────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── load attendance + employee profile + leave balances ──────────────────
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
      if (balRes.status === 'fulfilled') setBalances(balRes.value.data?.balances || []);
    } catch {
      // non-fatal
    } finally {
      if (mountedRef.current) setAttLoading(false);
    }
  }, [user?.employeeId]);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => { mountedRef.current = false; };
  }, [loadData]);

  // ── check in ──────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      const res = await attendanceAPI.checkIn();
      setAttendance(res.data.record);
    } catch (err) {
      console.error('Check-in failed', err);
    } finally {
      setActionLoading(false);
    }
  };

  // ── check out ─────────────────────────────────────────────────────────────
  const handleCheckOut = async () => {
    setActionLoading(true);
    try {
      const res = await attendanceAPI.checkOut();
      setAttendance(res.data.record);
    } catch (err) {
      console.error('Check-out failed', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (!user) return null;

  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  const checkedIn  = attendance?.check_in && !attendance?.check_out;
  const checkedOut = attendance?.check_in && attendance?.check_out;

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  // pick up to 3 leave balance entries
  const displayBalances = balances.slice(0, 3);
  const balanceColors = ['blue', 'green', 'yellow', 'purple'];

  return (
    <div className="card p-0 overflow-hidden">
      {/* ── header strip ──────────────────────────────────────────────────── */}
      <div className="gradient-bg px-5 py-5">
        {/* top row: avatar + name | clock */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Initials name={fullName} avatarUrl={user.avatarUrl} size="lg" />
            <div className="min-w-0">
              <div className="text-xs text-white/70 mb-0.5">{greeting()},</div>
              <div className="text-white font-bold text-lg leading-tight truncate">{fullName}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {roleBadge(user.role)}
                {employee?.department_name && (
                  <span className="flex items-center gap-1 text-white/70 text-xs">
                    <Building2 size={10} />
                    {employee.department_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* live clock — right aligned, no absolute positioning */}
          <div className="text-right flex-shrink-0">
            <div className="text-white/90 text-xs font-mono tracking-wider tabular-nums">{timeStr}</div>
            <div className="text-white/60 text-[10px] mt-0.5 whitespace-nowrap">{dateStr}</div>
          </div>
        </div>
      </div>

      {/* ── check-in / check-out row ───────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-oe-border/60">
        {attLoading ? (
          <div className="flex items-center justify-center h-12">
            <div className="w-5 h-5 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {/* status */}
            <div className="flex-1 min-w-0">
              {!attendance && (
                <span className="inline-flex items-center gap-1.5 text-sm text-oe-muted">
                  <span className="w-2 h-2 rounded-full bg-oe-muted/50 flex-shrink-0" />
                  Not checked in yet
                </span>
              )}
              {checkedIn && (
                <div>
                  <div className="flex items-center gap-1.5 text-oe-success text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-oe-success animate-pulse flex-shrink-0" />
                    Checked in
                  </div>
                  <div className="text-xs text-oe-muted mt-0.5">Since {fmtTime(attendance.check_in)}</div>
                </div>
              )}
              {checkedOut && (
                <div>
                  <div className="flex items-center gap-1.5 text-oe-primary text-sm font-semibold">
                    <CheckCircle2 size={14} className="flex-shrink-0" />
                    Day complete
                  </div>
                  <div className="text-xs text-oe-muted mt-0.5">
                    {fmtTime(attendance.check_in)} – {fmtTime(attendance.check_out)}
                  </div>
                </div>
              )}
            </div>

            {/* elapsed / hours */}
            {checkedIn && (
              <div className="text-center flex-shrink-0">
                <div className="text-xl font-mono font-bold text-oe-text tabular-nums">
                  {fmtElapsed(attendance.check_in)}
                </div>
                <div className="text-[10px] text-oe-muted uppercase tracking-wider">elapsed</div>
              </div>
            )}
            {checkedOut && (
              <div className="text-center flex-shrink-0">
                <div className="text-xl font-mono font-bold text-oe-success tabular-nums">
                  {parseFloat(attendance.work_hours || 0).toFixed(1)}h
                </div>
                <div className="text-[10px] text-oe-muted uppercase tracking-wider">worked</div>
              </div>
            )}

            {/* action button */}
            <div className="flex-shrink-0">
              {!attendance && (
                <button
                  onClick={handleCheckIn}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-oe-success text-white text-sm font-semibold hover:bg-oe-success/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <LogIn size={15} />}
                  Check In
                </button>
              )}
              {checkedIn && (
                <button
                  onClick={handleCheckOut}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-oe-warning text-white text-sm font-semibold hover:bg-oe-warning/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <LogOut size={15} />}
                  Check Out
                </button>
              )}
              {checkedOut && (
                <div className="flex items-center gap-1.5 text-xs text-oe-muted">
                  <CheckCircle2 size={14} className="text-oe-success" />
                  Done
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── leave balances ─────────────────────────────────────────────────── */}
      {displayBalances.length > 0 && (
        <div className="px-5 py-4 border-t border-oe-border/60">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-oe-muted uppercase tracking-wider">Leave Balances</span>
            <button
              onClick={() => router.push('/leaves')}
              className="text-xs text-oe-primary hover:underline"
            >
              View all
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {displayBalances.map((b, i) => (
              <BalancePill
                key={b.leave_type_id || i}
                label={b.leave_type_name || b.name}
                used={parseInt(b.days_used || b.used || 0)}
                total={parseInt(b.total_days || b.total || 0)}
                color={balanceColors[i % balanceColors.length]}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── quick info ─────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-t border-oe-border/60 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {employee?.position_title && (
          <div className="flex items-center gap-2 text-xs text-oe-muted">
            <Briefcase size={12} className="text-oe-primary flex-shrink-0" />
            <span className="truncate">{employee.position_title}</span>
          </div>
        )}
        {employee?.employee_id && (
          <div className="flex items-center gap-2 text-xs text-oe-muted">
            <User size={12} className="text-oe-primary flex-shrink-0" />
            <span className="truncate">ID: {employee.employee_id}</span>
          </div>
        )}
        {employee?.hire_date && (
          <div className="flex items-center gap-2 text-xs text-oe-muted">
            <Calendar size={12} className="text-oe-primary flex-shrink-0" />
            <span className="truncate">
              Since {new Date(employee.hire_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
            </span>
          </div>
        )}
        <div
          className="flex items-center gap-2 text-xs text-oe-primary cursor-pointer hover:underline"
          onClick={() => user.employeeId && router.push(`/employees/${user.employeeId}`)}
        >
          <TrendingUp size={12} className="flex-shrink-0" />
          <span>View my profile</span>
        </div>
      </div>
    </div>
  );
}
