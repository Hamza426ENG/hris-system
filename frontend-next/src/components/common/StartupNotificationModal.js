import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { leavesAPI, announcementsAPI } from '@/services/api';
import { Calendar, AlertCircle, ChevronRight, Clock } from 'lucide-react';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function StartupNotificationModal() {
  const { user, permissions } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [urgentAnnouncements, setUrgentAnn] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    // Only show after a fresh login, not on page refresh
    const justLoggedIn = sessionStorage.getItem('hris_just_logged_in');
    if (!justLoggedIn) {
      setLoading(false);
      return;
    }
    // Clear the flag so it won't show again on refresh
    sessionStorage.removeItem('hris_just_logged_in');

    setLoading(true);
    try {
      const [leavesRes, annRes] = await Promise.allSettled([
        permissions?.isTeamLead ? leavesAPI.list({ status: 'pending' }) : Promise.resolve({ data: [] }),
        announcementsAPI.list(),
      ]);

      const leaves = leavesRes.status === 'fulfilled' ? (leavesRes.value.data || []).slice(0, 5) : [];
      const anns = annRes.status === 'fulfilled'
        ? (annRes.value.data || []).filter(a => a.priority === 'urgent' || a.priority === 'high').slice(0, 4)
        : [];

      setPendingLeaves(leaves);
      setUrgentAnn(anns);

      if (leaves.length > 0 || anns.length > 0) {
        setOpen(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, permissions?.isTeamLead]);

  useEffect(() => { load(); }, [load]);

  const goTo = (path) => {
    setVisible(false);
    setTimeout(() => {
      setOpen(false);
      router.push(path);
    }, 200);
  };

  if (!open || loading) return null;

  const total = pendingLeaves.length + urgentAnnouncements.length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop — no click handler, cannot dismiss */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-sm transition-all duration-200"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <div className="bg-oe-card rounded-xl overflow-hidden shadow-xl border border-oe-border">

          {/* Header */}
          <div className="px-5 pt-5 pb-4">
            <p className="text-xs text-oe-muted font-medium uppercase tracking-wider">Action Required</p>
            <p className="text-lg font-bold text-oe-text mt-1">
              {total} pending item{total !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Items */}
          <div className="px-3 pb-3 space-y-1 max-h-[50vh] overflow-y-auto">

            {/* Pending Leaves */}
            {pendingLeaves.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                  <Calendar size={12} className="text-amber-500" />
                  <span className="text-[11px] font-semibold text-oe-muted uppercase tracking-wider">
                    Leave Approvals ({pendingLeaves.length})
                  </span>
                </div>
                {pendingLeaves.map(l => (
                  <button
                    key={l.id}
                    onClick={() => goTo('/leaves?status=pending')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-oe-bg transition-colors text-left"
                  >
                    <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                      {(l.employee_name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-oe-text truncate">{l.employee_name}</div>
                      <div className="text-xs text-oe-muted">
                        {l.leave_type_name || 'Leave'} · {l.total_days || 1}d · {fmtDate(l.start_date)}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-oe-muted flex-shrink-0" />
                  </button>
                ))}
              </>
            )}

            {/* Urgent Announcements */}
            {urgentAnnouncements.length > 0 && (
              <>
                {pendingLeaves.length > 0 && <div className="border-t border-oe-border/40 my-1" />}
                <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                  <AlertCircle size={12} className="text-red-500" />
                  <span className="text-[11px] font-semibold text-oe-muted uppercase tracking-wider">
                    Important Alerts ({urgentAnnouncements.length})
                  </span>
                </div>
                {urgentAnnouncements.map(a => (
                  <button
                    key={a.id}
                    onClick={() => goTo('/announcements')}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-oe-bg transition-colors text-left"
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${a.priority === 'urgent' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      <AlertCircle size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-oe-text line-clamp-1">{a.title}</div>
                      {a.content && <div className="text-xs text-oe-muted line-clamp-1 mt-0.5">{a.content}</div>}
                    </div>
                    <ChevronRight size={14} className="text-oe-muted flex-shrink-0 mt-0.5" />
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Footer — mandatory action */}
          <div className="px-4 py-3 border-t border-oe-border/50 bg-oe-bg">
            {pendingLeaves.length > 0 ? (
              <button
                onClick={() => goTo('/leaves?status=pending')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white gradient-bg hover:opacity-90 transition-opacity"
              >
                Review Pending Leaves
              </button>
            ) : (
              <button
                onClick={() => goTo('/announcements')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white gradient-bg hover:opacity-90 transition-opacity"
              >
                View Announcements
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
