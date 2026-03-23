import React from 'react';
import {
  Phone, MapPin, Calendar, Badge, Clock, TrendingUp,
  Heart, Shield, LogIn, LogOut, Wifi, Zap
} from 'lucide-react';

// ── formatted values ─────────────────────────────────────────────────────────

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusColor(status) {
  switch (status?.toLowerCase()) {
    case 'average performer':
      return 'bg-oe-warning/15 text-oe-warning border border-oe-warning/30';
    case 'high performer':
      return 'bg-oe-success/15 text-oe-success border border-oe-success/30';
    case 'top performer':
      return 'bg-oe-primary/15 text-oe-primary border border-oe-primary/30';
    default:
      return 'bg-oe-muted/15 text-oe-muted border border-oe-muted/30';
  }
}

function MetricBox({ label, value, unit = '', color = 'primary', size = 'sm' }) {
  const sizeClass = size === 'lg' ? 'p-4' : 'p-3';
  const colorMap = {
    primary: 'bg-oe-primary/10 text-oe-primary border-oe-primary/20',
    success: 'bg-oe-success/10 text-oe-success border-oe-success/20',
    warning: 'bg-oe-warning/10 text-oe-warning border-oe-warning/20',
    purple: 'bg-oe-purple/10 text-oe-purple border-oe-purple/20',
    cyan: 'bg-oe-cyan/10 text-oe-cyan border-oe-cyan/20',
  };
  return (
    <div className={`${sizeClass} rounded-lg border ${colorMap[color]} text-center`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-oe-muted mt-1">{label}</div>
      {unit && <div className="text-[10px] text-oe-muted/70 mt-0.5">{unit}</div>}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-oe-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-oe-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-oe-muted">{label}</div>
        <div className="text-sm font-semibold text-oe-text truncate">{value || '—'}</div>
      </div>
    </div>
  );
}

function AttendanceBar({ label, percentage }) {
  const colors = {
    wfh: 'bg-oe-primary',
    wfo: 'bg-oe-success',
  };
  const color = label === 'WFH' ? colors.wfh : colors.wfo;
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-oe-text">{label}</span>
        <span className="text-xs font-bold text-oe-text">{percentage}%</span>
      </div>
      <div className="h-2 rounded-full bg-oe-border/50 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function EmployeeProfileCard({ employee = {} }) {
  const {
    first_name = '',
    last_name = '',
    position_title = '',
    employment_type = 'full_time',
    status = 'active',
    phone_primary = '',
    phone_secondary = '',
    emergency_contact_name = '',
    emergency_contact_phone = '',
    hire_date = '',
    date_of_birth = '',
    address_line1 = '',
    address_line2 = '',
    employee_id = '',
    avatar_url = '',
    department_name = '',
    shift_time = '09:00 AM',
    wfh_percentage = 44,
    wfo_percentage = 56,
    missing_io = false,
    life_insurance_group = '',
    health_insurance_group = '',
    actual_time = 0,
    active_time = 0,
    total_hours = 0,
  } = employee;

  // Calculate tenure and age
  const calculateTenure = (hireDate) => {
    if (!hireDate) return 0;
    const hire = new Date(hireDate);
    const now = new Date();
    const years = (now - hire) / (1000 * 60 * 60 * 24 * 365.25);
    return years.toFixed(1);
  };

  const calculateAge = (dob) => {
    if (!dob) return 0;
    const birth = new Date(dob);
    const now = new Date();
    const years = (now - birth) / (1000 * 60 * 60 * 24 * 365.25);
    return years.toFixed(1);
  };

  const tenure_years = calculateTenure(hire_date);
  const age_years = calculateAge(date_of_birth);

  // Get employee status for badge
  const getEmployeeStatus = () => {
    // Map status to readable format
    const statusMap = {
      'active': 'Active',
      'inactive': 'Inactive',
      'on_leave': 'On Leave',
      'terminated': 'Terminated',
      'probation': 'Probation',
    };
    return statusMap[status?.toLowerCase()] || 'Active';
  };

  // Performance data (from props or defaults)
  const performance = employee.performance || {
    period_start: '03/09/2026',
    period_end: '03/14/2026',
    productivity: 7.5,
    knowledge: 9,
    attitude: 9.8,
    discipline: 0,
    actual_time: actual_time || 6,
    active_time: active_time || 6.6,
    total_hours: total_hours || 38.9,
    productivity_pct: 37.5,
    knowledge_pct: 18,
    attitude_pct: 9.8,
    discipline_pct: 6,
    total_pct: 77.9,
  };

  const attendance = {
    wfh_percentage: wfh_percentage,
    wfo_percentage: wfo_percentage,
    shift_time: shift_time,
    check_in_time: null,
    check_out_time: null,
  };

  const fullName = `${first_name} ${last_name}`.trim();
  const initials = `${first_name?.[0] || ''}${last_name?.[0] || ''}`.toUpperCase();

  return (
    <div className="space-y-4">
      {/* ── HEADER SECTION ─────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        {/* gradient banner */}
        <div className="gradient-bg h-20" />

        {/* content overlapping banner */}
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-10 mb-6">
            {/* avatar */}
            {avatar_url ? (
              <img
                src={avatar_url}
                alt={fullName}
                className="w-20 h-20 rounded-xl object-cover ring-4 ring-oe-bg border border-oe-border flex-shrink-0"
              />
            ) : (
              <div className="w-20 h-20 gradient-bg rounded-xl flex items-center justify-center text-2xl font-bold text-white ring-4 ring-oe-bg border border-oe-border flex-shrink-0">
                {initials}
              </div>
            )}

            {/* name + role */}
            <div className="flex-1 min-w-0 pb-1">
              <h2 className="text-2xl font-bold text-oe-text">{fullName}</h2>
              <p className="text-sm text-oe-muted truncate">{position_title}</p>
            </div>
          </div>

          {/* status + type badges */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <badge className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor(status === 'active' ? 'Average Performer' : status)}`}>
              {getEmployeeStatus() === 'Active' ? 'Average Performer' : getEmployeeStatus()}
            </badge>
            <span className="inline-block px-3 py-1 rounded-full bg-oe-primary/15 text-oe-primary text-xs font-semibold border border-oe-primary/30">
              JD
            </span>
            {department_name && (
              <span className="text-xs text-oe-muted">{department_name}</span>
            )}
          </div>

          {/* key info grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <InfoRow icon={Badge} label="Employee ID" value={employee_id} />
            <InfoRow icon={Phone} label="Contact" value={phone_primary || phone_secondary} />
            <InfoRow icon={Calendar} label="Joining Date" value={formatDate(hire_date)} />
            <InfoRow icon={Clock} label="Tenure" value={`${tenure_years} yrs`} />
          </div>

          {/* divider */}
          <div className="border-t border-oe-border/50 -mx-6 mb-6" />

          {/* two-column layout for remaining info */}
          <div className="grid grid-cols-2 gap-6">
            {/* left: personal */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider">Personal</h4>
              <div className="space-y-2.5">
                <InfoRow icon={Zap} label="Age" value={`${age_years} yrs`} />
                <InfoRow icon={Phone} label="Emergency #" value={emergency_contact_phone} />
                <InfoRow icon={MapPin} label="Address" value={address_line1} />
              </div>
            </div>

            {/* right: status */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider">Status</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-oe-muted">Employment Type</span>
                  <span className="text-xs font-bold px-2 py-1 rounded bg-oe-primary/15 text-oe-primary">
                    {employment_type?.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-oe-muted">Missing I/O</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${missing_io ? 'bg-oe-danger/15 text-oe-danger' : 'bg-oe-success/15 text-oe-success'}`}>
                    {missing_io ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PERFORMANCE SECTION ────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-oe-text">Performance Metrics</h3>
            <p className="text-xs text-oe-muted mt-1">
              {performance.period_start} – {performance.period_end}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-oe-primary">{performance.total_pct}%</div>
            <div className="text-xs text-oe-muted">Overall</div>
          </div>
        </div>

        {/* metrics grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <MetricBox label="Productivity" value={performance.productivity} unit={`${performance.productivity_pct}%`} color="primary" />
          <MetricBox label="Knowledge" value={performance.knowledge} unit={`${performance.knowledge_pct}%`} color="success" />
          <MetricBox label="Attitude" value={performance.attitude} unit={`${performance.attitude_pct}%`} color="warning" />
          <MetricBox label="Discipline" value="—" unit={`${performance.discipline_pct}%`} color="purple" />
        </div>

        {/* divider */}
        <div className="border-t border-oe-border/50 -mx-6 mb-6" />

        {/* time tracking */}
        <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider mb-3">Time Tracking</h4>
        <div className="grid grid-cols-3 gap-3">
          <MetricBox label="Actual Time" value={performance.actual_time} unit="hours" color="cyan" size="sm" />
          <MetricBox label="Active Time" value={performance.active_time} unit="hours" color="success" size="sm" />
          <MetricBox label="Total Hours" value={performance.total_hours} unit="hours" color="primary" size="sm" />
        </div>
      </div>

      {/* ── ATTENDANCE SECTION ─────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="font-bold text-oe-text mb-5 flex items-center gap-2">
          <Clock size={18} className="text-oe-primary" />
          Attendance & Shifts
        </h3>

        <div className="space-y-6">
          {/* shift time */}
          <div className="p-4 rounded-lg bg-oe-primary/10 border border-oe-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-oe-muted mb-1">Shift Time</div>
                <div className="text-lg font-bold text-oe-text">{attendance.shift_time}</div>
              </div>
              <Clock size={24} className="text-oe-primary opacity-60" />
            </div>
          </div>

          {/* check in/out */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-oe-success/10 border border-oe-success/20 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <LogIn size={14} className="text-oe-success" />
                <span className="text-[10px] text-oe-muted uppercase font-bold">Check In</span>
              </div>
              <div className="text-sm font-semibold text-oe-text">
                {attendance.check_in_time || '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-oe-warning/10 border border-oe-warning/20 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <LogOut size={14} className="text-oe-warning" />
                <span className="text-[10px] text-oe-muted uppercase font-bold">Check Out</span>
              </div>
              <div className="text-sm font-semibold text-oe-text">
                {attendance.check_out_time || '—'}
              </div>
            </div>
          </div>

          {/* WFH / WFO split */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider">Work location distribution</h4>
            <div className="space-y-3">
              <AttendanceBar label="WFH" percentage={attendance.wfh_percentage} />
              <AttendanceBar label="WFO" percentage={attendance.wfo_percentage} />
            </div>
          </div>
        </div>
      </div>

      {/* ── BENEFITS SECTION ───────────────────────────────────────────────── */}
      {(life_insurance_group || health_insurance_group) && (
        <div className="card">
          <h3 className="font-bold text-oe-text mb-4 flex items-center gap-2">
            <Heart size={18} className="text-oe-danger" />
            Benefits & Insurance
          </h3>

          <div className="grid grid-cols-2 gap-4">
            {life_insurance_group && (
              <div className="p-4 rounded-lg border border-oe-border/50 bg-oe-surface/50">
                <div className="flex items-center gap-2 mb-2">
                  <Heart size={14} className="text-oe-danger" />
                  <span className="text-xs text-oe-muted font-semibold">Life Insurance Group</span>
                </div>
                <div className="text-sm font-semibold text-oe-text">{life_insurance_group}</div>
              </div>
            )}
            {health_insurance_group && (
              <div className="p-4 rounded-lg border border-oe-border/50 bg-oe-surface/50">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-oe-primary" />
                  <span className="text-xs text-oe-muted font-semibold">Health Insurance Group</span>
                </div>
                <div className="text-sm font-semibold text-oe-text">{health_insurance_group}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
