import React from 'react';
import {
  Phone, MapPin, Calendar, Badge, Clock, TrendingUp,
  Heart, Shield, User, Briefcase, Mail, Globe, Hash,
  Users, Building, MapPinned, Star, Activity, CreditCard, Landmark
} from 'lucide-react';

function formatDate(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Always renders — shows a muted dash when the value is empty (no icon background, no border)
function InfoItem({ icon: Icon, label, value, iconColor = 'text-oe-primary' }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex items-start gap-3 py-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${empty ? '' : 'bg-oe-surface'}`}>
        <Icon size={14} className={empty ? 'text-oe-muted/25' : iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-oe-muted uppercase tracking-wide font-medium">{label}</div>
        <div className={`text-sm break-words ${empty ? 'text-oe-muted/40 font-normal' : 'font-semibold text-oe-text'}`}>
          {empty ? '—' : value}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider mb-3 pb-2 border-b border-oe-border/40">
      {title}
    </h4>
  );
}

function PerformanceBar({ label, value, percentage, color }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-oe-muted">{label}</span>
        <span className="text-xs font-bold text-oe-text">{value} <span className="text-oe-muted font-normal">({percentage}%)</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-oe-border/40 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>
    </div>
  );
}

export default function EmployeeProfileCard({ employee = {}, showBanking = false }) {
  const {
    employee_id,
    first_name,
    last_name,
    date_of_birth,
    gender,
    marital_status,
    nationality,
    national_id,
    personal_email,
    work_email,
    phone_primary,
    phone_secondary,
    address_line1,
    address_line2,
    city,
    state,
    country,
    postal_code,
    emergency_contact_name,
    emergency_contact_relation,
    emergency_contact_phone,
    department_name,
    position_title,
    grade,
    level,
    manager_name,
    employment_type,
    status,
    hire_date,
    confirmation_date,
    work_location,
    bio,
    skills,
    languages,
    life_insurance_group,
    health_insurance_group,
    bank_name,
    bank_account_number,
    account_holder_name,
    iban,
    insurance_card_number,
  } = employee;

  const calculateYears = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    return ((now - d) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
  };

  const tenure = calculateYears(hire_date);
  const age = calculateYears(date_of_birth);
  const performance = employee.performance;

  const fullAddress = [address_line1, address_line2, city, state, country, postal_code].filter(Boolean).join(', ');
  const formatType = (t) => t ? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
  const skillsStr = (skills && skills.length > 0) ? (Array.isArray(skills) ? skills.join(', ') : skills) : null;
  const languagesStr = (languages && languages.length > 0) ? (Array.isArray(languages) ? languages.join(', ') : languages) : null;
  const dobValue = date_of_birth ? `${formatDate(date_of_birth)}${age ? ` (${age} yrs)` : ''}` : null;
  const hireDateValue = hire_date ? `${formatDate(hire_date)}${tenure ? ` (${tenure} yrs)` : ''}` : null;
  const gradeValue = grade ? `${grade}${level ? ` · Level ${level}` : ''}` : null;

  return (
    <div className="card p-0 overflow-hidden">
      {/* Card Header */}
      <div className="px-6 py-4 border-b border-oe-border/50 bg-oe-surface/30">
        <h3 className="font-bold text-oe-text text-sm">Employee Overview</h3>
        <p className="text-xs text-oe-muted mt-0.5">
          Complete profile details{(first_name || last_name) ? ` for ${first_name || ''} ${last_name || ''}`.trim() : ''}
        </p>
      </div>

      <div className="p-6">
        {/* Bio */}
        {bio && (
          <div className="mb-6 p-4 rounded-lg bg-oe-surface/50 border border-oe-border/30">
            <p className="text-sm text-oe-text leading-relaxed">{bio}</p>
          </div>
        )}

        {/* Main Grid — 3 columns on large, 2 on medium, 1 on small */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">

          {/* ── Personal Details ────────────────────────────────────── */}
          <div>
            <SectionHeader title="Personal Details" />
            <div className="space-y-0.5">
              <InfoItem icon={User} label="Full Name" value={`${first_name || ''} ${last_name || ''}`.trim() || null} />
              <InfoItem icon={Calendar} label="Date of Birth" value={dobValue} />
              <InfoItem icon={User} label="Gender" value={formatType(gender)} iconColor="text-oe-purple" />
              <InfoItem icon={Heart} label="Marital Status" value={formatType(marital_status)} iconColor="text-oe-danger" />
              <InfoItem icon={Globe} label="Nationality" value={nationality} iconColor="text-oe-success" />
              <InfoItem icon={Hash} label="National ID" value={national_id} iconColor="text-oe-warning" />
              <InfoItem icon={Star} label="Skills" value={skillsStr} iconColor="text-oe-warning" />
              <InfoItem icon={Globe} label="Languages" value={languagesStr} iconColor="text-oe-cyan" />
            </div>
          </div>

          {/* ── Employment Details ───────────────────────────────────── */}
          <div>
            <SectionHeader title="Employment Details" />
            <div className="space-y-0.5">
              <InfoItem icon={Badge} label="Employee ID" value={employee_id} />
              <InfoItem icon={Building} label="Department" value={department_name} iconColor="text-oe-purple" />
              <InfoItem icon={Briefcase} label="Position" value={position_title} iconColor="text-oe-success" />
              <InfoItem icon={TrendingUp} label="Grade / Level" value={gradeValue} iconColor="text-oe-warning" />
              <InfoItem icon={Users} label="Manager" value={manager_name} iconColor="text-oe-cyan" />
              <InfoItem icon={Activity} label="Employment Type" value={formatType(employment_type)} iconColor="text-oe-primary" />
              <InfoItem icon={Calendar} label="Hire Date" value={hireDateValue} iconColor="text-oe-success" />
              <InfoItem icon={Calendar} label="Confirmation Date" value={formatDate(confirmation_date)} iconColor="text-oe-warning" />
              <InfoItem icon={MapPinned} label="Work Location" value={work_location} iconColor="text-oe-purple" />
            </div>
          </div>

          {/* ── Contact & Emergency ──────────────────────────────────── */}
          <div>
            <SectionHeader title="Contact & Emergency" />
            <div className="space-y-0.5">
              <InfoItem icon={Mail} label="Work Email" value={work_email} />
              <InfoItem icon={Mail} label="Personal Email" value={personal_email} iconColor="text-oe-purple" />
              <InfoItem icon={Phone} label="Primary Phone" value={phone_primary} iconColor="text-oe-success" />
              <InfoItem icon={Phone} label="Secondary Phone" value={phone_secondary} iconColor="text-oe-warning" />
              <InfoItem icon={MapPin} label="Address" value={fullAddress || null} iconColor="text-oe-cyan" />
            </div>

            {/* Emergency Contact — always visible */}
            <div className="mt-4 p-3 rounded-lg bg-oe-danger/5 border border-oe-danger/15">
              <div className="text-[11px] text-oe-danger uppercase tracking-wide font-bold mb-2">Emergency Contact</div>
              {emergency_contact_name ? (
                <>
                  <div className="text-sm text-oe-text font-semibold">{emergency_contact_name}</div>
                  {emergency_contact_relation && <div className="text-xs text-oe-muted">{emergency_contact_relation}</div>}
                  {emergency_contact_phone && (
                    <div className="text-sm text-oe-text mt-1 flex items-center gap-1.5">
                      <Phone size={12} className="text-oe-danger" />
                      {emergency_contact_phone}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-oe-muted/40 font-normal">—</div>
              )}
            </div>

            {/* Benefits & Insurance — always visible */}
            <div className="mt-4">
              <div className="text-[11px] text-oe-muted uppercase tracking-wide font-bold mb-2">Benefits & Insurance</div>
              <div className="space-y-0.5">
                <InfoItem icon={Heart} label="Life Insurance" value={life_insurance_group} iconColor="text-oe-danger" />
                <InfoItem icon={Shield} label="Health Insurance" value={health_insurance_group} iconColor="text-oe-primary" />
              </div>
            </div>
          </div>

          {/* ── Banking & Finance (only when showBanking=true) ──────── */}
          {showBanking && (
            <div>
              <SectionHeader title="Banking & Finance" />
              <div className="space-y-0.5">
                <InfoItem icon={Landmark} label="Bank Name" value={bank_name} iconColor="text-oe-primary" />
                <InfoItem icon={User} label="Account Holder" value={account_holder_name} iconColor="text-oe-muted" />
                <InfoItem icon={CreditCard} label="Account Number" value={bank_account_number} iconColor="text-oe-warning" />
                <InfoItem icon={Hash} label="IBAN" value={iban} iconColor="text-oe-cyan" />
                <InfoItem icon={Shield} label="Insurance Card No." value={insurance_card_number} iconColor="text-oe-success" />
              </div>
            </div>
          )}
        </div>

        {/* ── Performance (full width, below the grid) ──────────────── */}
        {performance && (
          <div className="border-t border-oe-border/40 mt-6 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider">Performance Metrics</h4>
                {(performance.period_start || performance.period_end) && (
                  <p className="text-[11px] text-oe-muted mt-0.5">
                    {formatDate(performance.period_start)} – {formatDate(performance.period_end)}
                  </p>
                )}
              </div>
              {performance.total_pct != null && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-oe-primary">{performance.total_pct}%</div>
                  <div className="text-[11px] text-oe-muted">Overall Score</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {performance.productivity != null && (
                <PerformanceBar label="Productivity" value={performance.productivity} percentage={performance.productivity_pct || 0} color="bg-oe-primary" />
              )}
              {performance.knowledge != null && (
                <PerformanceBar label="Knowledge" value={performance.knowledge} percentage={performance.knowledge_pct || 0} color="bg-oe-success" />
              )}
              {performance.attitude != null && (
                <PerformanceBar label="Attitude" value={performance.attitude} percentage={performance.attitude_pct || 0} color="bg-oe-warning" />
              )}
              {performance.discipline != null && (
                <PerformanceBar label="Discipline" value={performance.discipline} percentage={performance.discipline_pct || 0} color="bg-oe-purple" />
              )}
            </div>

            {(performance.actual_time != null || performance.active_time != null || performance.total_hours != null) && (
              <div className="grid grid-cols-3 gap-3 mt-4">
                {performance.actual_time != null && (
                  <div className="text-center p-3 rounded-lg bg-oe-surface/50 border border-oe-border/30">
                    <div className="text-lg font-bold text-oe-text">{performance.actual_time}</div>
                    <div className="text-[11px] text-oe-muted">Actual Hours</div>
                  </div>
                )}
                {performance.active_time != null && (
                  <div className="text-center p-3 rounded-lg bg-oe-surface/50 border border-oe-border/30">
                    <div className="text-lg font-bold text-oe-text">{performance.active_time}</div>
                    <div className="text-[11px] text-oe-muted">Active Hours</div>
                  </div>
                )}
                {performance.total_hours != null && (
                  <div className="text-center p-3 rounded-lg bg-oe-surface/50 border border-oe-border/30">
                    <div className="text-lg font-bold text-oe-text">{performance.total_hours}</div>
                    <div className="text-[11px] text-oe-muted">Total Hours</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
