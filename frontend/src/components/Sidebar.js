import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, GitBranch, Calendar, DollarSign,
  BarChart3, Settings, ChevronLeft, Wallet, ShieldCheck, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import EdgeLogo from './EdgeLogo';

const allNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['super_admin', 'hr_admin', 'team_lead', 'employee'] },
  { to: '/employees', icon: Users, label: 'Employees', roles: ['super_admin', 'hr_admin', 'team_lead', 'employee'] },
  { to: '/organogram', icon: GitBranch, label: 'Organogram', roles: ['super_admin', 'hr_admin', 'team_lead'] },
  { to: '/leaves', icon: Calendar, label: 'Leave Management', roles: ['super_admin', 'hr_admin', 'team_lead', 'employee'] },
  { to: '/salary', icon: DollarSign, label: 'Salary & Comp', roles: ['super_admin', 'hr_admin', 'team_lead', 'employee'] },
  { to: '/payroll', icon: Wallet, label: 'Payroll', roles: ['super_admin', 'hr_admin'] },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['super_admin', 'hr_admin'] },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['super_admin', 'hr_admin'] },
  { to: '/admin', icon: ShieldCheck, label: 'Admin Panel', roles: ['super_admin', 'hr_admin'] },
];

export default function Sidebar({ open, setOpen }) {
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role;

  const navItems = allNavItems.filter(item => item.roles.includes(role));

  const navContent = (isDrawer = false) => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-oe-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {(open || isDrawer) ? (
            <EdgeLogo height={28} showText={true} />
          ) : (
            <EdgeLogo height={28} showText={false} />
          )}
        </div>
        {isDrawer && (
          <button
            onClick={() => setOpen(false)}
            className="ml-auto p-1.5 rounded-lg text-oe-muted hover:text-oe-text hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {(open || isDrawer) && <div className="text-xs font-semibold text-oe-muted uppercase tracking-widest px-3 pb-2 pt-1">Navigation</div>}
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={isDrawer ? () => setOpen(false) : undefined}
              className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
              title={!open && !isDrawer ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {(open || isDrawer) && <span>{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse btn — hidden on mobile drawer */}
      {!isDrawer && (
        <div className="p-3 border-t border-oe-border">
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-oe-muted hover:text-oe-text hover:bg-slate-100 transition-colors text-sm"
          >
            <ChevronLeft size={16} className={`transition-transform duration-300 ${!open ? 'rotate-180' : ''}`} />
            {open && <span>Collapse</span>}
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar — inline, hidden on mobile */}
      <aside className={`hidden md:flex ${open ? 'w-60' : 'w-16'} flex-shrink-0 bg-white border-r border-oe-border flex-col transition-all duration-300 relative z-20 shadow-sm`}>
        {navContent(false)}
      </aside>

      {/* Mobile drawer backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed left-0 top-0 h-full w-64 bg-white border-r border-oe-border flex flex-col z-50 shadow-xl transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {navContent(true)}
      </aside>
    </>
  );
}
