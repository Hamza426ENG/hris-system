import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { authAPI } from '@/services/api';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';
import { Mail, Shield, Clock, Calendar, User } from 'lucide-react';

const fmtRole = (r) =>
  r ? r.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const ROLE_COLOR = {
  super_admin: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  hr_admin:    'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  manager:     'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
  team_lead:   'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
  employee:    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/30',
};

function AdminProfileContent() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authAPI.me()
      .then(res => setProfile(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const data = profile || authUser;
  const initials = `${data?.first_name?.[0] || data?.firstName?.[0] || ''}${data?.last_name?.[0] || data?.lastName?.[0] || ''}`.toUpperCase() || data?.email?.[0]?.toUpperCase() || 'U';
  const fullName = [data?.first_name || data?.firstName, data?.last_name || data?.lastName].filter(Boolean).join(' ') || data?.email;
  const roleCls = ROLE_COLOR[data?.role] || ROLE_COLOR.employee;

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="card">
        {/* Avatar + name */}
        <div className="flex flex-col items-center text-center py-8 px-6 border-b border-oe-border">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white mb-4 shadow-lg">
            {initials}
          </div>
          <h1 className="text-xl font-bold text-oe-text mb-1">{fullName}</h1>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${roleCls}`}>
            <Shield size={11} />
            {fmtRole(data?.role)}
          </span>
        </div>

        {/* Account details */}
        <div className="divide-y divide-oe-border">
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="w-8 h-8 rounded-md bg-oe-surface flex items-center justify-center flex-shrink-0">
              <Mail size={14} className="text-oe-primary" />
            </div>
            <div>
              <div className="text-[11px] text-oe-muted uppercase tracking-wide font-medium">Email</div>
              <div className="text-sm font-medium text-oe-text">{data?.email}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-6 py-4">
            <div className="w-8 h-8 rounded-md bg-oe-surface flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-oe-primary" />
            </div>
            <div>
              <div className="text-[11px] text-oe-muted uppercase tracking-wide font-medium">Account Type</div>
              <div className="text-sm font-medium text-oe-text">System Account</div>
            </div>
          </div>

          {data?.last_login && (
            <div className="flex items-center gap-3 px-6 py-4">
              <div className="w-8 h-8 rounded-md bg-oe-surface flex items-center justify-center flex-shrink-0">
                <Clock size={14} className="text-oe-primary" />
              </div>
              <div>
                <div className="text-[11px] text-oe-muted uppercase tracking-wide font-medium">Last Login</div>
                <div className="text-sm font-medium text-oe-text">{fmtDate(data.last_login)}</div>
              </div>
            </div>
          )}

          {data?.created_at && (
            <div className="flex items-center gap-3 px-6 py-4">
              <div className="w-8 h-8 rounded-md bg-oe-surface flex items-center justify-center flex-shrink-0">
                <Calendar size={14} className="text-oe-primary" />
              </div>
              <div>
                <div className="text-[11px] text-oe-muted uppercase tracking-wide font-medium">Account Created</div>
                <div className="text-sm font-medium text-oe-text">{fmtDate(data.created_at)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileContent() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user?.employeeId) {
      router.replace(`/employees/${user.employeeId}`);
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Redirecting to employee profile
  if (user?.employeeId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No employee record — show admin/system account profile
  return <AdminProfileContent />;
}

export default function ProfilePage() {
  return (
    <PrivateRoute>
      <Layout>
        <ProfileContent />
      </Layout>
    </PrivateRoute>
  );
}
