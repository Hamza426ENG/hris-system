import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, GitBranch, Calendar, DollarSign,
  BarChart3, Settings, ChevronLeft, Wallet, Building2
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/employees', icon: Users, label: 'Employees' },
  { to: '/organogram', icon: GitBranch, label: 'Organogram' },
  { to: '/leaves', icon: Calendar, label: 'Leave Management' },
  { to: '/salary', icon: DollarSign, label: 'Salary & Comp' },
  { to: '/payroll', icon: Wallet, label: 'Payroll' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ open, setOpen }) {
  const location = useLocation();

  return (
    <aside className={`${open ? 'w-60' : 'w-16'} flex-shrink-0 bg-white border-r border-oe-border flex flex-col transition-all duration-300 relative z-20 shadow-sm`}>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-oe-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 gradient-bg rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-white" />
          </div>
          {open && (
            <div className="overflow-hidden">
              <div className="text-sm font-bold text-oe-text">OnEdge HRIS</div>
              <div className="text-xs text-oe-muted">HR Management</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {open && <div className="text-xs font-semibold text-oe-muted uppercase tracking-widest px-3 pb-2 pt-1">Navigation</div>}
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
              title={!open ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {open && <span>{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse btn */}
      <div className="p-3 border-t border-oe-border">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-oe-muted hover:text-oe-text hover:bg-slate-100 transition-colors text-sm"
        >
          <ChevronLeft size={16} className={`transition-transform duration-300 ${!open ? 'rotate-180' : ''}`} />
          {open && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
