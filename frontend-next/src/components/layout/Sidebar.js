import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  LayoutDashboard, Users, GitBranch, Calendar, DollarSign,
  BarChart3, Settings, ChevronLeft, Wallet, ShieldCheck, X
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import EdgeLogo from '@/components/common/EdgeLogo';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['super_admin', 'hr_admin', 'team_lead', 'employee'] },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/employees', icon: Users, label: 'Employees', roles: ['super_admin', 'hr_admin', 'team_lead', 'employee'] },
      { to: '/organogram', icon: GitBranch, label: 'Organogram', roles: ['super_admin', 'hr_admin', 'team_lead'] },
      { to: '/leaves', icon: Calendar, label: 'Leave Management', roles: ['super_admin', 'hr_admin', 'team_lead', 'employee'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/salary', icon: DollarSign, label: 'Salary & Comp', roles: ['super_admin', 'hr_admin', 'team_lead', 'employee'] },
      { to: '/payroll', icon: Wallet, label: 'Payroll', roles: ['super_admin', 'hr_admin'] },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['super_admin', 'hr_admin'] },
      { to: '/settings', icon: Settings, label: 'Settings', roles: ['super_admin', 'hr_admin'] },
      { to: '/admin', icon: ShieldCheck, label: 'Admin Panel', roles: ['super_admin'] },
    ],
  },
];

const ROLE_BADGE = {
  super_admin: { label: 'Super Admin', cls: 'bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30' },
  hr_admin:    { label: 'HR Admin',    cls: 'bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30' },
  team_lead:   { label: 'Team Lead',   cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30' },
  employee:    { label: 'Employee',    cls: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/30' },
};

export default function Sidebar({ open, setOpen }) {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role;

  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => item.roles.includes(role)),
  })).filter(group => group.items.length > 0);

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
    : 'U';
  const fullName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';
  const badge = ROLE_BADGE[role] || ROLE_BADGE.employee;

  const navContent = (isDrawer = false) => (
    <>
      {/* Header / Logo */}
      <div className="h-16 flex items-center px-4 flex-shrink-0 border-b border-slate-200 dark:border-white/8">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 text-oe-primary dark:text-white">
            <EdgeLogo className={(open || isDrawer) ? "h-5 w-auto" : "h-5 w-5"} />
          </div>
          {(open || isDrawer) && (
            <div className="overflow-hidden">
              <div className="text-[11px] font-semibold text-slate-400 dark:text-white/50 uppercase tracking-widest leading-none">HRIS Platform</div>
            </div>
          )}
        </div>
        {isDrawer && (
          <button
            onClick={() => setOpen(false)}
            className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-5">
        {visibleGroups.map(group => (
          <div key={group.label}>
            {(open || isDrawer) && (
              <div className="text-[10px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-[0.15em] px-3 mb-1.5">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => {
                const isActive = to === '/' ? router.pathname === '/' : router.pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    href={to}
                    onClick={isDrawer ? () => setOpen(false) : undefined}
                    title={!open && !isDrawer ? label : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative group ${
                      isActive
                        ? 'bg-oe-primary/10 text-oe-primary dark:bg-white/12 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-white/55 dark:hover:text-white dark:hover:bg-white/8'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-oe-primary dark:bg-violet-400 rounded-r-full" />
                    )}
                    <Icon size={16} className={`flex-shrink-0 transition-colors ${
                      isActive
                        ? 'text-oe-primary dark:text-violet-400'
                        : 'text-slate-400 group-hover:text-slate-700 dark:text-white/45 dark:group-hover:text-white/80'
                    }`} />
                    {(open || isDrawer) && <span className="truncate">{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User info block */}
      {(open || isDrawer) && (
        <div className="px-3 py-3 border-t border-slate-200 dark:border-white/8">
          <div className="flex items-center gap-3 px-2 py-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[11px] font-semibold text-slate-600 dark:text-white/80 flex-shrink-0 ring-1 ring-slate-300 dark:ring-white/15">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 dark:text-white/80 truncate leading-tight">{fullName || user?.email}</div>
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle — desktop only */}
      {!isDrawer && (
        <div className="px-2 py-2 border-t border-slate-200 dark:border-white/8">
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white dark:hover:bg-white/8 transition-colors text-xs"
            title={open ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <ChevronLeft size={14} className={`transition-transform duration-300 ${!open ? 'rotate-180' : ''}`} />
            {open && <span>Collapse</span>}
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden md:flex ${
        open ? 'w-56' : 'w-14'
      } flex-shrink-0 flex-col transition-all duration-300 relative z-20 bg-white dark:bg-[#0f1117] border-r border-slate-200 dark:border-white/8 shadow-sm dark:shadow-none`}>
        {navContent(false)}
      </aside>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 dark:bg-black/60 z-40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed left-0 top-0 h-full w-64 flex flex-col z-50 shadow-2xl transition-transform duration-300 bg-white dark:bg-[#0f1117] ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent(true)}
      </aside>
    </>
  );
}
