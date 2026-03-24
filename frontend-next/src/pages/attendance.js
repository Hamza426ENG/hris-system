import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { attendanceAPI, employeesAPI } from '@/services/api';
import {
  Fingerprint, Clock, LogIn, LogOut, Calendar, TrendingUp,
  Search, Download, ChevronDown, ArrowUpDown, Building2,
  Briefcase, AlertCircle, ChevronLeft, ChevronRight, Filter,
  Sun, Moon as MoonIcon, Coffee
} from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function fmtTimeShort(iso) {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function fmtDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long' });
}

function fmtHours(h) {
  if (!h && h !== 0) return 'N/A';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}:${String(mins).padStart(2, '0')}`;
}

function fmtHoursLong(h) {
  if (!h && h !== 0) return 'N/A';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  const secs = 0;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ── Stat Circle Card ─────────────────────────────────────────────────────────

function StatCircle({ label, value, sub, color = 'primary' }) {
  const ringColors = {
    primary: 'border-oe-primary/30 bg-oe-primary/5',
    success: 'border-oe-success/30 bg-oe-success/5',
    warning: 'border-oe-warning/30 bg-oe-warning/5',
    danger:  'border-oe-danger/30 bg-oe-danger/5',
    purple:  'border-oe-purple/30 bg-oe-purple/5',
    cyan:    'border-oe-cyan/30 bg-oe-cyan/5',
    muted:   'border-oe-border bg-oe-surface',
  };
  const textColors = {
    primary: 'text-oe-primary',
    success: 'text-oe-success',
    warning: 'text-oe-warning',
    danger:  'text-oe-danger',
    purple:  'text-oe-purple',
    cyan:    'text-oe-cyan',
    muted:   'text-oe-muted',
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-24 h-24 rounded-full border-2 flex flex-col items-center justify-center ${ringColors[color]}`}>
        <div className={`text-lg font-bold leading-tight ${textColors[color]}`}>{value}</div>
        {sub && <div className="text-[10px] text-oe-muted mt-0.5">{sub}</div>}
      </div>
      <span className="text-xs text-oe-muted font-medium text-center leading-tight max-w-[100px]">{label}</span>
    </div>
  );
}

// ── Employee Selector (Admin/HR) ─────────────────────────────────────────────

function EmployeeSelector({ value, onChange, employees, loading }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q)
      || (e.employee_id || '').toLowerCase().includes(q);
  });

  const selected = employees.find(e => e.id === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-oe-border bg-oe-surface hover:border-oe-primary/40 transition-colors min-w-[260px]"
      >
        {selected ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {`${selected.first_name?.[0] || ''}${selected.last_name?.[0] || ''}`.toUpperCase()}
            </div>
            <div className="text-left min-w-0">
              <div className="text-sm font-medium text-oe-text truncate">{selected.employee_id} : {selected.first_name} {selected.last_name}</div>
            </div>
          </div>
        ) : (
          <span className="text-sm text-oe-muted">Select Member</span>
        )}
        <ChevronDown size={14} className="text-oe-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-oe-card border border-oe-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-oe-border">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-oe-bg">
              <Search size={14} className="text-oe-muted" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employees..."
                className="bg-transparent text-sm text-oe-text outline-none flex-1"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center text-sm text-oe-muted">No employees found</div>
            ) : (
              filtered.map(e => (
                <button
                  key={e.id}
                  onClick={() => { onChange(e.id); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-oe-bg transition-colors text-left ${e.id === value ? 'bg-oe-primary/5' : ''}`}
                >
                  <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {`${e.first_name?.[0] || ''}${e.last_name?.[0] || ''}`.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-oe-text truncate">{e.first_name} {e.last_name}</div>
                    <div className="text-xs text-oe-muted">{e.employee_id} · {e.department_name || 'No dept'}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Period Selector ──────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange, startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-4 py-2.5 rounded-xl border border-oe-border bg-oe-surface text-sm text-oe-text focus:border-oe-primary outline-none"
      >
        <option value="month_to_date">Month to Date</option>
        <option value="last_30_days">Last 30 Days</option>
        <option value="custom">Custom Range</option>
      </select>
      {value === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => onStartChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-oe-border bg-oe-surface text-sm text-oe-text focus:border-oe-primary outline-none"
          />
          <span className="text-oe-muted text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={e => onEndChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-oe-border bg-oe-surface text-sm text-oe-text focus:border-oe-primary outline-none"
          />
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function AttendanceContent() {
  const { user, permissions } = useAuth();
  const router = useRouter();

  const canSelectEmployee = permissions?.isTeamLead;

  const [employeeId, setEmployeeId] = useState(null);
  const [employees, setEmployees]   = useState([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState('month_to_date');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);

  // Set initial employee
  useEffect(() => {
    if (router.query.employee) {
      setEmployeeId(router.query.employee);
    } else if (user?.employeeId) {
      setEmployeeId(user.employeeId);
    }
  }, [user?.employeeId, router.query.employee]);

  // Load employee list for admin/HR
  useEffect(() => {
    if (!canSelectEmployee) return;
    setEmpLoading(true);
    employeesAPI.list({ limit: 500, status: 'active' })
      .then(res => setEmployees(res.data?.data || []))
      .catch(() => {})
      .finally(() => setEmpLoading(false));
  }, [canSelectEmployee]);

  // Load attendance summary
  const loadSummary = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const params = { period, page, limit: 100 };
      if (period === 'custom') {
        params.start_date = startDate;
        params.end_date = endDate;
      }
      const res = await attendanceAPI.summary(employeeId, params);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load attendance summary:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId, period, startDate, endDate, page]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Export to CSV
  const exportCSV = () => {
    if (!data?.records?.length) return;
    const headers = ['Sr #', 'Date', 'Day', 'Check In', 'Check Out', 'Actual Hours', 'Status', 'Source'];
    const rows = data.records.map((r, i) => [
      i + 1,
      fmtDate(r.date),
      fmtDay(r.date),
      fmtTime(r.check_in),
      r.check_out ? fmtTime(r.check_out) : '',
      r.work_hours ? fmtHoursLong(r.work_hours) : '',
      r.status || '',
      r.source || 'manual',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${data.employee?.emp_code || 'export'}_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter records by search
  const records = (data?.records || []).filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return fmtDate(r.date).includes(q) || fmtDay(r.date).toLowerCase().includes(q) || (r.status || '').toLowerCase().includes(q);
  });

  // Build raw punches lookup (date → punches[])
  const rawByDate = {};
  (data?.rawPunches || []).forEach(p => {
    const d = new Date(p.punch_time).toISOString().split('T')[0];
    if (!rawByDate[d]) rawByDate[d] = [];
    rawByDate[d].push(p);
  });

  const totalPages = Math.ceil((data?.total || 0) / (data?.limit || 100));
  const emp = data?.employee;

  if (!employeeId && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-oe-muted">
        <Fingerprint size={40} className="mb-3 opacity-30" />
        <p className="text-sm">No employee record linked to your account</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header Bar ──────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
            <Fingerprint size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-oe-text">Attendance</h1>
            {emp && (
              <p className="text-xs text-oe-muted mt-0.5">
                {emp.first_name} {emp.last_name} · {emp.emp_code} · {emp.department_name || '—'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {canSelectEmployee && (
            <EmployeeSelector
              value={employeeId}
              onChange={setEmployeeId}
              employees={employees}
              loading={empLoading}
            />
          )}
          <PeriodSelector
            value={period}
            onChange={setPeriod}
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* ── Summary Cards ────────────────────────────────────────── */}
          <div className="card p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 divide-x divide-oe-border/40">
              {/* Last Working Day */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold text-oe-muted uppercase tracking-wider">
                  Last Working Day {data.lastWorkingDay ? `(${fmtDate(data.lastWorkingDay.date)})` : ''}
                </h3>
                <div className="flex items-center gap-4 flex-wrap">
                  <StatCircle label="Last Check-In" value={data.lastWorkingDay ? fmtTimeShort(data.lastWorkingDay.checkIn) : 'N/A'} color="success" />
                  <StatCircle label="Last Check-Out" value={data.lastWorkingDay?.checkOut ? fmtTimeShort(data.lastWorkingDay.checkOut) : 'N/A'} color="danger" />
                  <StatCircle label="Total Hours" value={data.lastWorkingDay?.totalHours ? fmtHours(data.lastWorkingDay.totalHours) : 'N/A'} color="primary" />
                </div>
              </div>

              {/* Last 30 Days */}
              <div className="flex flex-col gap-3 pl-6">
                <h3 className="text-xs font-bold text-oe-muted uppercase tracking-wider">Last 30 Days</h3>
                <div className="flex items-center gap-4 flex-wrap">
                  <StatCircle label="Avg. Check-In" value={data.last30Days?.avgCheckIn || 'N/A'} color="cyan" />
                  <StatCircle label="Avg. Check-Out" value={data.last30Days?.avgCheckOut || 'N/A'} color="purple" />
                  <StatCircle label="Avg. Working Hrs" value={data.last30Days?.avgWorkHours || 'N/A'} color="primary" />
                </div>
              </div>

              {/* Month to Date */}
              <div className="flex flex-col gap-3 pl-6">
                <h3 className="text-xs font-bold text-oe-muted uppercase tracking-wider">Month to Date</h3>
                <div className="flex items-center gap-4 flex-wrap">
                  <StatCircle label="Leaves" value={data.monthToDate?.leaves ?? 0} color="warning" />
                  <StatCircle label="Absents" value={data.monthToDate?.absents ?? 0} color="danger" />
                  <StatCircle label="Avg. Working Hrs" value={data.monthToDate?.avgWorkHours || 'N/A'} color="success" />
                </div>
              </div>

              {/* Hours Percentage */}
              <div className="flex flex-col gap-3 pl-6">
                <h3 className="text-xs font-bold text-oe-muted uppercase tracking-wider">Hours Percentage</h3>
                <div className="flex items-center gap-4 flex-wrap">
                  <StatCircle label="Work from Home" value={`${data.hoursPercentage?.wfh || 0}%`} color="purple" />
                  <StatCircle label="Work from Office" value={`${data.hoursPercentage?.wfo || 0}%`} color="cyan" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Period Stats Row ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="card py-3 px-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-oe-success/10 flex items-center justify-center">
                <LogIn size={16} className="text-oe-success" />
              </div>
              <div>
                <div className="text-lg font-bold text-oe-text">{data.periodStats?.avgCheckIn || 'N/A'}</div>
                <div className="text-[11px] text-oe-muted">Avg Check-In</div>
              </div>
            </div>
            <div className="card py-3 px-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-oe-danger/10 flex items-center justify-center">
                <LogOut size={16} className="text-oe-danger" />
              </div>
              <div>
                <div className="text-lg font-bold text-oe-text">{data.periodStats?.avgCheckOut || 'N/A'}</div>
                <div className="text-[11px] text-oe-muted">Avg Check-Out</div>
              </div>
            </div>
            <div className="card py-3 px-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-oe-primary/10 flex items-center justify-center">
                <Clock size={16} className="text-oe-primary" />
              </div>
              <div>
                <div className="text-lg font-bold text-oe-text">{data.periodStats?.avgWorkHours || 'N/A'}</div>
                <div className="text-[11px] text-oe-muted">Avg Hours/Day</div>
              </div>
            </div>
            <div className="card py-3 px-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-oe-purple/10 flex items-center justify-center">
                <TrendingUp size={16} className="text-oe-purple" />
              </div>
              <div>
                <div className="text-lg font-bold text-oe-text">{data.periodStats?.totalHours || 0}</div>
                <div className="text-[11px] text-oe-muted">Total Hours</div>
              </div>
            </div>
            <div className="card py-3 px-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-oe-cyan/10 flex items-center justify-center">
                <Calendar size={16} className="text-oe-cyan" />
              </div>
              <div>
                <div className="text-lg font-bold text-oe-text">{data.periodStats?.presentDays || 0}</div>
                <div className="text-[11px] text-oe-muted">Present Days</div>
              </div>
            </div>
          </div>

          {/* ── Table Section ────────────────────────────────────────── */}
          <div className="card p-0 overflow-hidden">
            {/* Table toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-oe-border/50 gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-oe-bg border border-oe-border flex-1">
                  <Search size={14} className="text-oe-muted" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by date, day, status..."
                    className="bg-transparent text-sm text-oe-text outline-none flex-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Legend */}
                <div className="hidden lg:flex items-center gap-4 text-[11px]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-oe-purple" /> WFH</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-oe-success" /> On Time</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-oe-warning" /> Late / Short</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-oe-danger" /> Missing I/O</span>
                </div>

                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-oe-border text-xs font-medium text-oe-text hover:bg-oe-bg transition-colors"
                >
                  <Download size={13} /> Export CSV
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-oe-primary to-oe-primary/80 text-white">
                    <th className="px-4 py-3 text-left font-semibold text-xs w-14">Sr #</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs">Day</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs">Check In</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs">Check Out</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs">Actual Hours</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs">Salary Hours</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-oe-muted">
                        <Fingerprint size={28} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No attendance records for this period</p>
                      </td>
                    </tr>
                  ) : (
                    records.map((r, i) => {
                      const dateStr = r.date ? new Date(r.date).toISOString().split('T')[0] : '';
                      const hasCheckIn = !!r.check_in;
                      const hasCheckOut = !!r.check_out;
                      const missingIO = (hasCheckIn && !hasCheckOut) || (!hasCheckIn && hasCheckOut);
                      const workHrs = parseFloat(r.work_hours || 0);
                      const isShort = workHrs > 0 && workHrs < 8;
                      const isLate = r.check_in && new Date(r.check_in).getHours() >= 10;
                      const extraHrs = workHrs > 8 ? (workHrs - 8).toFixed(1) : null;

                      // Determine row highlight
                      let rowBg = '';
                      if (missingIO) rowBg = 'bg-oe-danger/5 border-l-2 border-oe-danger';
                      else if (isShort || isLate) rowBg = 'bg-oe-warning/5 border-l-2 border-oe-warning';

                      // Device punches for this date
                      const punches = rawByDate[dateStr] || [];

                      return (
                        <tr key={r.id} className={`border-b border-oe-border/30 hover:bg-oe-bg/50 transition-colors ${rowBg}`}>
                          <td className="px-4 py-3 text-oe-muted tabular-nums">{(page - 1) * (data?.limit || 100) + i + 1}</td>
                          <td className="px-4 py-3 text-oe-text font-medium tabular-nums">{fmtDate(r.date)}</td>
                          <td className="px-4 py-3 text-oe-text">{fmtDay(r.date)}</td>
                          <td className="px-4 py-3">
                            {hasCheckIn ? (
                              <span className="text-oe-success font-medium tabular-nums">{fmtTime(r.check_in)}</span>
                            ) : (
                              <span className="text-oe-danger text-xs font-medium">Missing</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {hasCheckOut ? (
                              <span className="text-oe-text tabular-nums">{fmtTime(r.check_out)}</span>
                            ) : hasCheckIn ? (
                              <span className="text-oe-warning text-xs font-medium">Not checked out</span>
                            ) : (
                              <span className="text-oe-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-oe-text tabular-nums">
                            {workHrs > 0 ? fmtHoursLong(workHrs) : <span className="text-oe-muted">—</span>}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {workHrs > 0 ? (
                              <span className="text-oe-text">{fmtHoursLong(Math.min(workHrs, 8))}</span>
                            ) : <span className="text-oe-muted">—</span>}
                            {extraHrs && (
                              <span className="ml-1.5 text-xs text-oe-success font-semibold">+{extraHrs}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {r.status === 'present' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-oe-success bg-oe-success/10 px-2 py-0.5 rounded-full">Present</span>
                            ) : r.status === 'absent' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-oe-danger bg-oe-danger/10 px-2 py-0.5 rounded-full">Absent</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-oe-muted bg-oe-surface px-2 py-0.5 rounded-full">{r.status || '—'}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {r.source === 'device' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-oe-cyan">
                                <Fingerprint size={11} /> Device
                              </span>
                            ) : (
                              <span className="text-[11px] text-oe-muted">Manual</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-oe-border/50">
                <span className="text-xs text-oe-muted">
                  Showing {(page - 1) * (data?.limit || 100) + 1}–{Math.min(page * (data?.limit || 100), data?.total || 0)} of {data?.total || 0}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg text-oe-muted hover:text-oe-text hover:bg-oe-bg disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-oe-text font-medium px-2">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg text-oe-muted hover:text-oe-text hover:bg-oe-bg disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Raw Device Punches (expandable detail) ───────────────── */}
          {data.rawPunches?.length > 0 && (
            <details className="card p-0 overflow-hidden">
              <summary className="px-4 py-3 cursor-pointer hover:bg-oe-bg transition-colors flex items-center gap-2 text-sm font-semibold text-oe-text">
                <Fingerprint size={15} className="text-oe-cyan" />
                Device Punch Log ({data.rawPunches.length} punches)
              </summary>
              <div className="overflow-x-auto border-t border-oe-border/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-oe-bg">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-oe-muted">#</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-oe-muted">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-oe-muted">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-oe-muted">In / Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rawPunches.map((p, i) => (
                      <tr key={i} className="border-b border-oe-border/20 hover:bg-oe-bg/50">
                        <td className="px-4 py-2 text-oe-muted tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2 text-oe-text tabular-nums">{fmtDate(p.punch_time)}</td>
                        <td className="px-4 py-2 text-oe-text font-medium tabular-nums">{fmtTime(p.punch_time)}</td>
                        <td className="px-4 py-2">
                          {p.punch_state === 0 ? (
                            <span className="text-oe-success text-xs font-medium">In</span>
                          ) : p.punch_state === 1 ? (
                            <span className="text-oe-danger text-xs font-medium">Out</span>
                          ) : (
                            <span className="text-oe-muted text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-oe-muted">
          <AlertCircle size={28} className="mb-2 opacity-30" />
          <p className="text-sm">Failed to load attendance data</p>
          <button onClick={loadSummary} className="mt-2 text-xs text-oe-primary hover:underline">Retry</button>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <PrivateRoute>
      <Layout>
        <AttendanceContent />
      </Layout>
    </PrivateRoute>
  );
}
