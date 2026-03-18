import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import { Calendar, Phone, MapPin, ChevronRight } from 'lucide-react';

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

export default function ProfileSummaryCard({ profile }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);

  if (!profile) return null;

  return (
    <div className="card p-5 space-y-4">
      {/* Avatar + name */}
      <div className="flex flex-col items-center text-center gap-2 pb-4 border-b border-oe-border">
        <div className="relative">
          <Avatar
            src={profile.avatar_url}
            firstName={profile.first_name}
            lastName={profile.last_name}
            size={80}
            className="ring-4 ring-oe-primary/20"
          />
          <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${profile.status === 'active' ? 'bg-oe-success' : 'bg-oe-warning'}`} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-oe-text">{profile.first_name} {profile.last_name}</h2>
          <p className="text-sm text-oe-primary font-medium">{profile.position_title || '—'}</p>
          <p className="text-xs text-oe-muted">{profile.department_name || '—'}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-center">
          <span className="text-xs px-2 py-0.5 bg-oe-primary/10 text-oe-primary rounded-full">{profile.employee_id}</span>
          <span className="text-xs px-2 py-0.5 bg-oe-success/10 text-oe-success rounded-full capitalize">
            {profile.employment_type?.replace('_', ' ')}
          </span>
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
            <span className="text-oe-text font-medium truncate max-w-[130px] text-right">{[profile.city, profile.country].filter(Boolean).join(', ')}</span>
          </div>
        )}
      </div>

      {isHR && (
        <button onClick={() => navigate(`/employees/${profile.id}`)} className="w-full btn-secondary text-xs justify-center">
          View Full Profile <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}
