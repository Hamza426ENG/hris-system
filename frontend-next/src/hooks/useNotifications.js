import { useState, useEffect, useRef, useCallback } from 'react';
import { leavesAPI, announcementsAPI } from '@/services/api';

/**
 * useNotifications - polls for pending leaves and announcements.
 * Extracted from Header to keep the component lean.
 */
export default function useNotifications(user) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seenIds, setSeenIds] = useState(new Set());
  const panelOpenRef = useRef(false);

  // Restore seen IDs from localStorage per user
  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`notif-seen-${user.id}`) || '[]');
      setSeenIds(new Set(stored));
    } catch {
      setSeenIds(new Set());
    }
  }, [user?.id]);

  const markAllSeen = useCallback((notifList) => {
    if (!user?.id) return;
    setSeenIds(prev => {
      const next = new Set([...prev, ...notifList.map(n => n.id)]);
      try {
        localStorage.setItem(`notif-seen-${user.id}`, JSON.stringify([...next].slice(-500)));
      } catch {}
      return next;
    });
  }, [user?.id]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      const all = [...leaveNotifs, ...announcementNotifs];
      setNotifications(all);
      if (panelOpenRef.current) markAllSeen(all);
    } catch {
      if (!silent) setNotifications([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [markAllSeen]);

  // Initial load + polling every 60s
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 60000);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = notifications.filter(n => !seenIds.has(n.id)).length;

  return { notifications, loading, unreadCount, markAllSeen, panelOpenRef, reload: load };
}
