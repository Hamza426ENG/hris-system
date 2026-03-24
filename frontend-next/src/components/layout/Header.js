import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Menu, Bell, LogOut, User, ChevronDown, CheckCircle2, Clock, Megaphone, Sun, Moon, TicketCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { leavesAPI, announcementsAPI, ticketsAPI } from '@/services/api';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/employees': 'Employees',
  '/organogram': 'Organogram',
  '/attendance': 'Attendance',
  '/leaves': 'Leave Management',
  '/salary': 'Salary & Compensation',
  '/payroll': 'Payroll',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/admin': 'Admin Panel',
  '/tickets': 'Tickets',
};

export default function Header({ sidebarOpen, setSidebarOpen }) {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [seenIds, setSeenIds] = useState(new Set());
  const notifRef = useRef(null);
  const menuRef = useRef(null);
  const notifPanelOpenRef = useRef(false);

  // Load seen notification IDs from localStorage per user
  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`notif-seen-${user.id}`) || '[]');
      setSeenIds(new Set(stored));
    } catch {
      setSeenIds(new Set());
    }
  }, [user?.id]);

  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
        notifPanelOpenRef.current = false;
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Initial load + real-time polling every 60s
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(() => loadNotifications(true), 60000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markAllSeen = (notifList) => {
    if (!user?.id) return;
    setSeenIds(prev => {
      const next = new Set([...prev, ...notifList.map(n => n.id)]);
      try {
        localStorage.setItem(`notif-seen-${user.id}`, JSON.stringify([...next].slice(-500)));
      } catch {}
      return next;
    });
  };

  const loadNotifications = async (silent = false) => {
    if (!silent) setNotifLoading(true);
    try {
      const [leavesRes, announcementsRes, ticketNotifsRes] = await Promise.all([
        leavesAPI.list({ status: 'pending' }),
        announcementsAPI.list(),
        ticketsAPI.notifications({ limit: 10, unread_only: 'true' }).catch(() => ({ data: { notifications: [] } })),
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
      const ticketNotifData = ticketNotifsRes?.data?.notifications || [];
      const ticketNotifs = ticketNotifData.slice(0, 8).map(tn => ({
        id: `ticket-${tn.id}`,
        _realId: tn.id,
        type: 'ticket',
        title: tn.notification_title || 'Ticket Update',
        subtitle: tn.ticket_title || tn.notification_message || '',
        time: tn.created_at,
        path: tn.ticket_id ? `/tickets/${tn.ticket_id}` : '/tickets',
      }));
      const all = [...ticketNotifs, ...leaveNotifs, ...announcementNotifs].sort((a, b) => new Date(b.time) - new Date(a.time));
      setNotifications(all);
      // If panel is open, auto-mark new notifications as seen
      if (notifPanelOpenRef.current) {
        markAllSeen(all);
        // Also mark ticket notifications as read on the server
        const ticketIds = ticketNotifData.filter(t => !t.is_read).map(t => t.id);
        if (ticketIds.length > 0) ticketsAPI.markNotificationsRead({ notification_ids: ticketIds }).catch(() => {});
      }
    } catch {
      if (!silent) setNotifications([]);
    } finally {
      if (!silent) setNotifLoading(false);
    }
  };

  const handleNotifToggle = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    notifPanelOpenRef.current = next;
    if (next) {
      loadNotifications();
      markAllSeen(notifications); // immediately clear badge
      // Mark all ticket notifications as read on server
      const ticketIds = notifications.filter(n => n.type === 'ticket' && n._realId).map(n => n._realId);
      if (ticketIds.length > 0) ticketsAPI.markNotificationsRead({ notification_ids: ticketIds }).catch(() => {});
    }
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

  const unreadCount = notifications.filter(n => !seenIds.has(n.id)).length;

  const title = Object.entries(PAGE_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => router.pathname === path || (path !== '/' && router.pathname.startsWith(path)))?.[1] || 'HRIS';

  const initials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() : 'U';

  return (
    <header className="h-16 bg-oe-surface border-b border-oe-border flex items-center justify-between px-4 sm:px-6 flex-shrink-0 shadow-sm">
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
        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          data-tip={dark ? 'Light mode' : 'Dark mode'}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-oe-muted hover:text-oe-text hover:bg-oe-bg transition-colors"
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={handleNotifToggle}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-oe-muted hover:text-oe-text hover:bg-slate-100 transition-colors relative"
          >
            <Bell size={18} />
            {!notifOpen && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-oe-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-1 w-[calc(100vw-2rem)] max-w-sm sm:w-80 bg-oe-surface border border-oe-border rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-oe-border bg-oe-bg">
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
                  notifications.map(n => {
                    const iconCfg = n.type === 'ticket'
                      ? { bg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400', icon: <TicketCheck size={14} /> }
                      : n.type === 'leave'
                        ? { bg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400', icon: <Clock size={14} /> }
                        : { bg: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400', icon: <Megaphone size={14} /> };
                    return (
                      <button
                        key={n.id}
                        onClick={() => { router.push(n.path); setNotifOpen(false); }}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-oe-bg transition-colors border-b border-oe-border last:border-0 text-left"
                      >
                        <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${iconCfg.bg}`}>
                          {iconCfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-oe-text truncate">{n.title}</div>
                          <div className="text-xs text-oe-muted truncate mt-0.5">{n.subtitle}</div>
                          <div className="text-xs text-oe-muted mt-1">{formatTime(n.time)}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              {notifications.length > 0 && (
                <div className="px-4 py-2.5 border-t border-oe-border bg-oe-bg flex items-center justify-center gap-3">
                  {notifications.some(n => n.type === 'ticket') && (
                    <button
                      onClick={() => { router.push('/tickets'); setNotifOpen(false); }}
                      className="text-xs text-oe-primary hover:underline"
                    >
                      View Tickets
                    </button>
                  )}
                  {notifications.some(n => n.type === 'leave') && (
                    <button
                      onClick={() => { router.push('/leaves'); setNotifOpen(false); }}
                      className="text-xs text-oe-primary hover:underline"
                    >
                      View Leaves
                    </button>
                  )}
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
            <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-sm font-medium text-oe-text">{user?.firstName} {user?.lastName}</div>
              <div className="text-xs text-oe-muted capitalize">{user?.role?.replace('_', ' ')}</div>
            </div>
            <ChevronDown size={14} className="text-oe-muted hidden sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-oe-surface border border-oe-border rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="p-3 border-b border-oe-border bg-oe-bg">
                <div className="text-sm font-medium text-oe-text">{user?.firstName} {user?.lastName}</div>
                <div className="text-xs text-oe-muted">{user?.email}</div>
              </div>
              {user?.employeeId && (
                <button
                  onClick={() => { router.push(`/employees/${user.employeeId}`); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-oe-muted hover:text-oe-text hover:bg-oe-bg transition-colors"
                >
                  <User size={14} /> My Profile
                </button>
              )}
              <button
                onClick={() => { logout(); router.push('/login'); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-oe-danger hover:bg-red-50 transition-colors"
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
