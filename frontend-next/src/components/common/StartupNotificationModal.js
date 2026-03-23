import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { leavesAPI, announcementsAPI } from '@/services/api';
import {
  Bell, X, Calendar, Megaphone, AlertCircle, AlertTriangle,
  ChevronRight, CheckCircle2, Clock, ArrowRight,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, count, color }) {
  const colorCls = {
    amber:  'bg-amber-500/10 text-amber-500 border-amber-500/20',
    red:    'bg-red-500/10 text-red-500 border-red-500/20',
    violet: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    blue:   'bg-oe-primary/10 text-oe-primary border-oe-primary/20',
  }[color] || 'bg-oe-primary/10 text-oe-primary border-oe-primary/20';

  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-md border flex items-center justify-center ${colorCls}`}>
          <Icon size={13} />
        </div>
        <span className="text-xs font-semibold text-oe-text uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${colorCls}`}>{count}</span>
    </div>
  );
}

function LeaveItem({ leave, onClick }) {
  const initials = (leave.employee_name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-oe-bg transition-colors group text-left"
    >
      <div className="w-8 h-8 gradient-bg rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-oe-text truncate">{leave.employee_name}</div>
        <div className="flex items-center gap-1.5 text-xs text-oe-muted mt-0.5">
          <span>{leave.leave_type_name || leave.leave_type || 'Leave'}</span>
          <span className="text-oe-border">·</span>
          <span>{leave.total_days || 1}d</span>
          <span className="text-oe-border">·</span>
          <span>{fmtDate(leave.start_date)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] bg-amber-500/10 text-amber-500 font-semibold px-2 py-0.5 rounded-full">Pending</span>
        <ChevronRight size={13} className="text-oe-muted group-hover:text-oe-primary transition-colors" />
      </div>
    </button>
  );
}

function AnnouncementItem({ ann, onClick }) {
  const isUrgent = ann.priority === 'urgent';
  const isHigh   = ann.priority === 'high';
  const Icon = isUrgent ? AlertCircle : isHigh ? AlertTriangle : Megaphone;
  const cls  = isUrgent
    ? 'bg-red-500/10 text-red-500'
    : isHigh
    ? 'bg-amber-500/10 text-amber-500'
    : 'bg-violet-500/10 text-violet-500';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-oe-bg transition-colors group text-left"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cls}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-oe-text line-clamp-1">{ann.title}</div>
        {ann.content && (
          <div className="text-xs text-oe-muted mt-0.5 line-clamp-2 leading-relaxed">{ann.content}</div>
        )}
        <div className="text-[11px] text-oe-muted/60 mt-1">{timeAgo(ann.created_at)}</div>
      </div>
      <ChevronRight size={13} className="text-oe-muted group-hover:text-oe-primary transition-colors flex-shrink-0 mt-1" />
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function StartupNotificationModal() {
  const { user, permissions } = useAuth();
  const router = useRouter();

  const [open, setOpen]               = useState(false);
  const [visible, setVisible]         = useState(false);
  const [pendingLeaves, setPendingLeaves]       = useState([]);
  const [urgentAnnouncements, setUrgentAnn]    = useState([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [leavesRes, annRes] = await Promise.allSettled([
        permissions?.isTeamLead ? leavesAPI.list({ status: 'pending' }) : Promise.resolve({ data: [] }),
        announcementsAPI.list(),
      ]);

      const leaves = leavesRes.status === 'fulfilled' ? (leavesRes.value.data || []).slice(0, 5) : [];
      const anns   = annRes.status   === 'fulfilled'
        ? (annRes.value.data || []).filter(a => a.priority === 'urgent' || a.priority === 'high').slice(0, 4)
        : [];

      setPendingLeaves(leaves);
      setUrgentAnn(anns);

      if (leaves.length > 0 || anns.length > 0) {
        setOpen(true);
        // slight delay for mount animation
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      }
    } catch {
      // silent — non-critical
    } finally {
      setLoading(false);
    }
  }, [user, permissions?.isTeamLead]);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => setOpen(false), 300);
  };

  const goTo = (path) => {
    dismiss();
    setTimeout(() => router.push(path), 150);
  };

  if (!open || loading) return null;

  const total = pendingLeaves.length + urgentAnnouncements.length;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={dismiss}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[6px] transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-md transition-all duration-300"
        style={{
          opacity:   visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(12px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Glow ring */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-oe-primary/40 via-oe-purple/30 to-oe-cyan/20 blur-sm" />

        <div className="relative bg-oe-card rounded-2xl overflow-hidden shadow-2xl border border-oe-border">

          {/* ── Gradient header ─────────────────────────────────── */}
          <div className="gradient-bg px-6 pt-5 pb-6 relative overflow-hidden">
            {/* decorative circles */}
            <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
            <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-white/5" />

            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-3">
                {/* pulsing bell */}
                <div className="relative">
                  <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                    <Bell size={20} className="text-white" />
                  </div>
                  {total > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg animate-pulse">
                      {total > 9 ? '9+' : total}
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-white/60 text-[11px] font-medium tracking-wide uppercase">Attention Required</div>
                  <div className="text-white font-bold text-lg leading-tight mt-0.5">
                    {total} Item{total !== 1 ? 's' : ''} Pending
                  </div>
                </div>
              </div>

              <button
                onClick={dismiss}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white/70 hover:text-white transition-all flex-shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            {/* summary pills */}
            <div className="flex items-center gap-2 mt-4 flex-wrap relative">
              {pendingLeaves.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/20 px-2.5 py-1 rounded-full">
                  <Clock size={11} />
                  {pendingLeaves.length} Leave{pendingLeaves.length !== 1 ? 's' : ''} Pending
                </span>
              )}
              {urgentAnnouncements.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-red-500/20 text-red-200 border border-red-400/20 px-2.5 py-1 rounded-full">
                  <AlertCircle size={11} />
                  {urgentAnnouncements.length} Alert{urgentAnnouncements.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* ── Body ────────────────────────────────────────────── */}
          <div className="px-4 py-4 space-y-4 max-h-[55vh] overflow-y-auto">

            {/* Pending Leave Approvals */}
            {pendingLeaves.length > 0 && (
              <div>
                <SectionHeader icon={Calendar} label="Pending Approvals" count={pendingLeaves.length} color="amber" />
                <div className="space-y-0.5">
                  {pendingLeaves.map(l => (
                    <LeaveItem key={l.id} leave={l} onClick={() => goTo('/leaves')} />
                  ))}
                </div>
                {pendingLeaves.length >= 5 && (
                  <button
                    onClick={() => goTo('/leaves')}
                    className="w-full mt-1 text-[11px] text-oe-primary hover:underline text-center py-1"
                  >
                    View all pending leave requests
                  </button>
                )}
              </div>
            )}

            {/* Divider */}
            {pendingLeaves.length > 0 && urgentAnnouncements.length > 0 && (
              <div className="border-t border-oe-border/50" />
            )}

            {/* Urgent / High-priority Announcements */}
            {urgentAnnouncements.length > 0 && (
              <div>
                <SectionHeader icon={AlertCircle} label="Important Announcements" count={urgentAnnouncements.length} color="red" />
                <div className="space-y-0.5">
                  {urgentAnnouncements.map(a => (
                    <AnnouncementItem key={a.id} ann={a} onClick={() => goTo('/announcements')} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────── */}
          <div className="px-4 py-3 border-t border-oe-border/60 bg-oe-bg flex items-center gap-2">
            <button
              onClick={dismiss}
              className="flex-1 py-2 rounded-xl text-sm font-medium text-oe-muted hover:text-oe-text border border-oe-border hover:border-oe-primary/30 hover:bg-oe-surface transition-all"
            >
              Dismiss
            </button>
            {pendingLeaves.length > 0 && (
              <button
                onClick={() => goTo('/leaves')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white gradient-bg hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
              >
                Review Now <ArrowRight size={14} />
              </button>
            )}
            {pendingLeaves.length === 0 && urgentAnnouncements.length > 0 && (
              <button
                onClick={() => goTo('/announcements')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white gradient-bg hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
              >
                View Alerts <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
