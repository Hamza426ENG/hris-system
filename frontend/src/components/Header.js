import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/employees': 'Employees',
  '/organogram': 'Organogram',
  '/leaves': 'Leave Management',
  '/salary': 'Salary & Compensation',
  '/payroll': 'Payroll',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

export default function Header({ sidebarOpen, setSidebarOpen }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const title = Object.entries(PAGE_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => location.pathname.startsWith(path))?.[1] || 'HRIS';

  const initials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() : 'U';

  return (
    <header className="h-16 bg-oe-surface border-b border-oe-border flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-4">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-oe-muted hover:text-oe-text transition-colors">
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-oe-text">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <button className="w-9 h-9 flex items-center justify-center rounded-lg text-oe-muted hover:text-oe-text hover:bg-oe-border transition-colors relative">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-oe-danger rounded-full"></span>
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-oe-border transition-colors"
          >
            <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-sm font-medium text-oe-text">{user?.firstName} {user?.lastName}</div>
              <div className="text-xs text-oe-muted capitalize">{user?.role?.replace('_', ' ')}</div>
            </div>
            <ChevronDown size={14} className="text-oe-muted" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-oe-card border border-oe-border rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-3 border-b border-oe-border">
                <div className="text-sm font-medium text-oe-text">{user?.firstName} {user?.lastName}</div>
                <div className="text-xs text-oe-muted">{user?.email}</div>
              </div>
              {user?.employeeId && (
                <button
                  onClick={() => { navigate(`/employees/${user.employeeId}`); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-oe-muted hover:text-oe-text hover:bg-oe-surface transition-colors"
                >
                  <User size={14} /> My Profile
                </button>
              )}
              <button
                onClick={() => { logout(); navigate('/login'); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-oe-danger hover:bg-oe-surface transition-colors"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
