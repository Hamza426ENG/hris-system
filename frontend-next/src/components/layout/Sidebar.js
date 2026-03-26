import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  LayoutDashboard, Users, GitBranch, Calendar, DollarSign,
  BarChart3, Settings, ChevronLeft, Wallet, ShieldCheck, X, Megaphone,
  Fingerprint, TicketCheck, Bot, Monitor, ClipboardList, LogOut, User, Bus
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import EdgeLogo from '@/components/common/EdgeLogo';
import EdgeVerseLogo from '@/components/common/EdgeVerseLogo';

const ALL_ROLES_KEY = '__all__';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ALL_ROLES_KEY },
      { to: '/profile', icon: User, label: 'My Profile', roles: ALL_ROLES_KEY },
      { to: '/announcements', icon: Megaphone, label: 'Announcements', roles: ALL_ROLES_KEY },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/employees', icon: Users, label: 'Employees', minLevel: 'manager' },
      { to: '/profile-requests', icon: ClipboardList, label: 'Profile Requests', minLevel: 'hr_admin' },
      { to: '/resignations', icon: LogOut, label: 'Resignations', minLevel: 'hr_admin' },
      { to: '/organogram', icon: GitBranch, label: 'Organogram', roles: ALL_ROLES_KEY },
      { to: '/attendance', icon: Fingerprint, label: 'Attendance', roles: ALL_ROLES_KEY, children: [
        { to: '/my-team-shifts', label: 'Team Shifts', roles: ['employee', 'team_lead', 'manager'] },
        { to: '/work-shifts', label: 'Work Shifts', minLevel: 'manager' },
        { to: '/assign-shifts', label: 'Assign Shifts', minLevel: 'manager' },
      ] },
      { to: '/transport', icon: Bus, label: 'Transport', roles: ALL_ROLES_KEY },
      { to: '/leaves', icon: Calendar, label: 'Leave Management', roles: ALL_ROLES_KEY },
      { to: '/tickets', icon: TicketCheck, label: 'Tickets', roles: ALL_ROLES_KEY },
      { to: '/edge-bot', icon: Bot, label: 'Edge Bot', roles: ALL_ROLES_KEY },
      { to: '/it-inventory', icon: Monitor, label: 'IT Inventory', minLevel: 'hr_admin' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/salary', icon: DollarSign, label: 'Salary & Comp', minLevel: 'hr_admin' },
      { to: '/payroll', icon: Wallet, label: 'Payroll', minLevel: 'manager' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/reports', icon: BarChart3, label: 'Reports', minLevel: 'manager' },
      { to: '/settings', icon: Settings, label: 'Settings', minLevel: 'hr_admin' },
      { to: '/admin', icon: ShieldCheck, label: 'Admin Panel', minLevel: 'hr_admin' },
    ],
  },
];

// Role hierarchy for access checks
const ROLE_HIERARCHY = { super_admin: 5, hr_admin: 4, manager: 3, team_lead: 2, employee: 1 };

const DEFAULT_BADGE_CLS = 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/30';
const ROLE_BADGE_CLS = {
  super_admin: 'bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  hr_admin:    'bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  manager:     'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
  team_lead:   'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
};

const fmtRole = (r) => r ? r.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';

export default function Sidebar({ open, setOpen }) {
  const router = useRouter();
  const { user } = useAuth();
  const { roles: allRoles } = useConfig();
  const role = user?.role;

  const userLevel = ROLE_HIERARCHY[role] || 0;
  const canSee = (item) => {
    if (item.roles === ALL_ROLES_KEY) return true;
    if (Array.isArray(item.roles)) return item.roles.includes(role);
    if (item.minLevel) return userLevel >= (ROLE_HIERARCHY[item.minLevel] || 0);
    return false;
  };
  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(canSee).map(item => ({
      ...item,
      children: item.children ? item.children.filter(canSee) : undefined,
    })),
  })).filter(group => group.items.length > 0);

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
    : 'U';
  const fullName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';
  const badgeCls = ROLE_BADGE_CLS[role] || DEFAULT_BADGE_CLS;
  const badgeLabel = fmtRole(role);

  const navContent = (isDrawer = false) => (
    <>
      {/* Header / Logo */}
      <div className="h-16 flex items-center px-4 flex-shrink-0 border-b border-slate-200 dark:border-white/8">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {(open || isDrawer) ? (
            <div className="overflow-hidden">
              <EdgeVerseLogo className="h-5 w-auto" />
            </div>
          ) : (
            <div className="flex-shrink-0 text-oe-primary dark:text-white">
              <EdgeLogo className="h-5 w-5" />
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
              {group.items.map(({ to, icon: Icon, label, children }) => {
                const isActive = to === '/' ? router.pathname === '/' : router.pathname.startsWith(to);
                const hasVisibleChildren = children && children.length > 0;
                const isChildActive = hasVisibleChildren && children.some(c => router.pathname.startsWith(c.to));
                const isExpanded = isActive || isChildActive;
                return (
                  <div key={to}>
                    <Link
                      href={to}
                      onClick={isDrawer ? () => setOpen(false) : undefined}
                      data-tip={!open && !isDrawer ? label : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative group ${
                        isActive
                          ? 'bg-oe-primary/10 text-oe-primary dark:bg-white/12 dark:text-white shadow-sm'
                          : isChildActive
                            ? 'text-oe-primary dark:text-white'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-white/55 dark:hover:text-white dark:hover:bg-white/8'
                      }`}
                    >
                      {(isActive || isChildActive) && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-oe-primary dark:bg-violet-400 rounded-r-full" />
                      )}
                      <Icon size={16} className={`flex-shrink-0 transition-colors ${
                        isActive || isChildActive
                          ? 'text-oe-primary dark:text-violet-400'
                          : 'text-slate-400 group-hover:text-slate-700 dark:text-white/45 dark:group-hover:text-white/80'
                      }`} />
                      {(open || isDrawer) && <span className="truncate">{label}</span>}
                    </Link>
                    {hasVisibleChildren && isExpanded && (open || isDrawer) && (
                      <div className="ml-5 pl-3 mt-0.5 mb-1 border-l border-slate-200 dark:border-white/10 space-y-0.5">
                        {children.map(child => {
                          const childActive = router.pathname.startsWith(child.to);
                          return (
                            <Link
                              key={child.to}
                              href={child.to}
                              onClick={isDrawer ? () => setOpen(false) : undefined}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                                childActive
                                  ? 'text-oe-primary bg-oe-primary/8 dark:text-white dark:bg-white/10'
                                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/45 dark:hover:text-white dark:hover:bg-white/8'
                              }`}
                            >
                              <span className={`w-1 h-1 rounded-full flex-shrink-0 ${childActive ? 'bg-oe-primary dark:bg-violet-400' : 'bg-slate-300 dark:bg-white/20'}`} />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User info block */}
      {(open || isDrawer) && (
        <div className="px-3 py-3 border-t border-slate-200 dark:border-white/8">
          <Link
            href="/profile"
            onClick={isDrawer ? () => setOpen(false) : undefined}
            className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[11px] font-semibold text-slate-600 dark:text-white/80 flex-shrink-0 ring-1 ring-slate-300 dark:ring-white/15">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 dark:text-white/80 truncate leading-tight">{fullName || user?.email}</div>
              <div className="text-[10px] text-slate-400 dark:text-white/40 group-hover:text-oe-primary transition-colors">View Profile →</div>
            </div>
          </Link>
        </div>
      )}

      {/* Collapse toggle — desktop only */}
      {!isDrawer && (
        <div className="px-2 py-2 border-t border-slate-200 dark:border-white/8">
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white dark:hover:bg-white/8 transition-colors text-xs"
            data-tip={open ? 'Collapse' : 'Expand'}
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
