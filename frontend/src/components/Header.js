import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell, LogOut, User, ChevronDown, CheckCircle2, Clock, Megaphone, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { leavesAPI, announcementsAPI, wfhAPI, resignationsAPI } from '../services/api';
import PendingApprovalsPopup from './PendingApprovalsPopup';

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
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const notifRef = useRef(null);
  const menuRef = useRef(null);

  const isApprover = ['super_admin', 'hr_admin', 'team_lead'].includes(user?.role);
  const empId = user?.employeeId;

  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Load count on mount for badge
  useEffect(() => { loadNotifications(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load pending approvals count for badge
  useEffect(() => {
    if (!isApprover || !empId) return;
    const isHR = ['super_admin', 'hr_admin'].includes(user?.role);
    Promise.all([
      leavesAPI.list({ status: 'pending' }),
      wfhAPI.list(),
      resignationsAPI.list(),
    ]).then(([lRes, wRes, rRes]) => {
      const lCount = (lRes.data || []).filter(l => l.status === 'pending').length;
      const wCount = (wRes.data || []).filter(w => w.status === 'pending' && w.supervisor_id === empId).length;
      const rList = rRes.data || [];
      const rCount = isHR
        ? rList.filter(r => r.status === 'supervisor_approved').length
        : rList.filter(r => r.status === 'pending' && r.supervisor_id === empId).length;
      setPendingCount(lCount + wCount + rCount);
    }).catch(() => {});
  }, [isApprover, empId, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadNotifications = async () => {
    setNotifLoading(true);
    try {
      const [leavesRes, announcementsRes] = await Promise.all([
        leavesAPI.list({ status: 'pending' }),
        announcementsAPI.list(),
      ]);
      const leaveNotifs = (leavesRes.data || []).slice(0, 5).map(l => ({
        id: `leave-${l.id}`,
        type: 'leave',
        title: `Leave request from ${l.employee_name || 'Employee'}`,
        subtitle: `${l.leave_type || 'Leave'} · ${l.days || 1} day(s) · Pending`,
        time: l.created_at,
        path: '/leaves',
      }));
      const announcementNotifs = (announcementsRes.data || []).slice(0, 3).map(a => ({
        id: `ann-${a.id}`,
        type: 'announcement',
        title: a.title,
        subtitle: a.content?.slice(0, 60) + (a.content?.length > 60 ? '…' : ''),
        time: a.created_at,
        path: '/settings',
      }));
      setNotifications([...leaveNotifs, ...announcementNotifs]);
    } catch {
      setNotifications([]);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleNotifToggle = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) loadNotifications();
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  };

  const title = Object.entries(PAGE_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path)))?.[1] || 'HRIS';

  const initials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() : 'U';
  const avatarSrc = user?.avatarUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${user?.firstName || ''} ${user?.lastName || ''}`)}&backgroundColor=1D6BE4,7C5CFC&backgroundType=gradientLinear&fontSize=36&fontWeight=600`;

  return (
    <>
    <header className="h-16 bg-white border-b border-oe-border flex items-center justify-between px-4 sm:px-6 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-oe-muted hover:text-oe-text transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base sm:text-lg font-semibold text-oe-text truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Pending Approvals */}
        {isApprover && (
          <button
            onClick={() => setApprovalsOpen(true)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-oe-muted hover:text-oe-text hover:bg-slate-100 transition-colors relative"
            title="Pending Approvals"
          >
            <ClipboardList size={18} />
            {pendingCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 bg-oe-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </button>
        )}

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={handleNotifToggle}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-oe-muted hover:text-oe-text hover:bg-slate-100 transition-colors relative"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-oe-danger rounded-full"></span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-1 w-[calc(100vw-2rem)] max-w-sm sm:w-80 bg-white border border-oe-border rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-oe-border bg-slate-50">
                <span className="text-sm font-semibold text-oe-text">Notifications</span>
                {notifications.length > 0 && (
                  <span className="text-xs bg-oe-primary text-white rounded-full px-2 py-0.5">{notifications.length}</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-oe-muted">
                    <CheckCircle2 size={28} className="mb-2 text-oe-success" />
                    <span className="text-sm">All caught up!</span>
                  </div>
                ) : (
                  notifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => { navigate(n.path); setNotifOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-oe-border last:border-0 text-left"
                    >
                      <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${n.type === 'leave' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                        {n.type === 'leave' ? <Clock size={14} /> : <Megaphone size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-oe-text truncate">{n.title}</div>
                        <div className="text-xs text-oe-muted truncate mt-0.5">{n.subtitle}</div>
                        <div className="text-xs text-oe-muted mt-1">{formatTime(n.time)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="px-4 py-2.5 border-t border-oe-border bg-slate-50">
                  <button
                    onClick={() => { navigate('/leaves'); setNotifOpen(false); }}
                    className="text-xs text-oe-primary hover:underline w-full text-center"
                  >
                    View all pending leaves
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors min-h-[44px]"
          >
            <img
              src={avatarSrc}
              alt={initials}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-oe-border"
            />
            <div className="text-left hidden sm:block">
              <div className="text-sm font-medium text-oe-text">{user?.firstName} {user?.lastName}</div>
              <div className="text-xs text-oe-muted capitalize">{user?.role?.replace('_', ' ')}</div>
            </div>
            <ChevronDown size={14} className="text-oe-muted hidden sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-52 bg-white border border-oe-border rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="p-3 border-b border-oe-border bg-slate-50 flex items-center gap-3">
                <img src={avatarSrc} alt={initials} className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-1 ring-oe-border" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-oe-text truncate">{user?.firstName} {user?.lastName}</div>
                  <div className="text-xs text-oe-muted truncate">{user?.email}</div>
                </div>
              </div>
              {user?.employeeId && (
                <button
                  onClick={() => { navigate(`/employees/${user.employeeId}`); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-oe-muted hover:text-oe-text hover:bg-slate-50 transition-colors"
                >
                  <User size={14} /> My Profile
                </button>
              )}
              <button
                onClick={() => { logout(); navigate('/login'); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-oe-danger hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>

    {approvalsOpen && (
      <PendingApprovalsPopup onClose={() => { setApprovalsOpen(false); }} />
    )}
  </>
  );
}
