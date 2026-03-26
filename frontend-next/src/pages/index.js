import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { dashboardAPI, announcementsAPI, ticketsAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Users, Calendar, Clock, Building2, TrendingUp, DollarSign, Gift, ChevronRight, Megaphone, AlertCircle, AlertTriangle, Info, TicketCheck, ChevronsUp, ChevronUp, Minus, ChevronDown, RefreshCw, Fingerprint, CheckCircle2, ClipboardList } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';
import ProfileDive from '@/components/common/ProfileDive';

const COLORS = ['#1D6BE4', '#7C5CFC', '#00D4FF', '#00D4AA', '#F5A623', '#FF4D6D'];

const colorMap = {
  primary: 'bg-oe-primary/10 text-oe-primary',
  success: 'bg-oe-success/10 text-oe-success',
  warning: 'bg-oe-warning/10 text-oe-warning',
  danger:  'bg-oe-danger/10 text-oe-danger',
  purple:  'bg-oe-purple/10 text-oe-purple',
  cyan:    'bg-oe-cyan/10 text-oe-cyan',
};

const MiniStatCard = ({ icon: Icon, label, value, sub, color = 'primary', onClick }) => (
  <div className={`stat-card flex items-center gap-3 py-3.5 ${onClick ? 'cursor-pointer hover:border-oe-primary/30 transition-colors' : ''}`} onClick={onClick}>
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color] || colorMap.primary}`}>
      <Icon size={18} />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-lg font-bold text-oe-text leading-none mb-0.5">{value}</div>
      <div className="text-xs text-oe-muted truncate">{label}</div>
      {sub && <div className="text-[11px] text-oe-muted/70 truncate">{sub}</div>}
    </div>
  </div>
);

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PRIORITY_CONFIG = {
  urgent: { cls: 'text-oe-danger',  bg: 'bg-oe-danger/8',  Icon: AlertCircle,   label: 'Urgent' },
  high:   { cls: 'text-oe-warning', bg: 'bg-oe-warning/8', Icon: AlertTriangle, label: 'High' },
  normal: { cls: 'text-oe-muted',   bg: 'bg-oe-surface',   Icon: Info,          label: null },
};

const fmtCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

// Renders each announcement item as plain HTML string for the recycler
function buildItemHTML(a) {
  const p = PRIORITY_CONFIG[a.priority] || PRIORITY_CONFIG.normal;
  const iconMap = {
    'text-oe-danger':  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    'text-oe-warning': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-warning);flex-shrink:0;margin-top:2px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'text-oe-muted':   '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-muted,#6b8db5);flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };
  const prioritySpan = p.label
    ? `<span style="font-size:11px;font-weight:600;color:${p.cls.includes('danger') ? 'var(--color-danger)' : 'var(--color-warning)'}">${p.label}</span><span style="color:#6b8db5;font-size:10px;margin:0 4px">·</span>`
    : '';
  const authorSpan = a.posted_by_name
    ? `<span style="color:#6b8db5;font-size:10px;margin:0 4px">·</span><span style="font-size:11px;color:#6b8db5">${a.posted_by_name}</span>`
    : '';
  return `
    <div style="padding:14px 16px;border-bottom:1px solid rgba(107,141,181,0.15)">
      <div style="display:flex;align-items:flex-start;gap:10px">
        ${iconMap[p.cls] || iconMap['text-oe-muted']}
        <div style="min-width:0;flex:1">
          <p style="font-size:13px;font-weight:600;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${a.title}</p>
          <p style="font-size:12px;color:#6b8db5;margin-top:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.5">${a.content}</p>
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;margin-top:6px">
            ${prioritySpan}
            <span style="font-size:11px;color:#6b8db5">${timeAgo(a.created_at)}</span>
            ${authorSpan}
          </div>
        </div>
      </div>
    </div>`;
}

// True circular recycler — no CSS keyframes, no duplication gaps.
// Each item is a real DOM node; when it scrolls past the top it moves to the bottom.
const AnnouncementTicker = React.memo(function AnnouncementTicker({ items, onViewAll }) {
  const trackRef = useRef(null);
  const hintRef  = useRef(null);
  const rafRef   = useRef(null);
  const yRef     = useRef(0);
  const pausedRef = useRef(false);

  // Build DOM nodes once on mount / when items change
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !items.length) return;

    cancelAnimationFrame(rafRef.current);

    const singleSetHTML = items.map(buildItemHTML).join('');
    track.innerHTML = singleSetHTML;
    yRef.current = 0;
    track.style.transform = 'translateY(0px)';

    // Wait one frame so the browser lays out the initial items and container gets its real height
    const setupId = requestAnimationFrame(() => {
      const container = track.parentElement;
      const containerH = container ? container.clientHeight : 400;

      // Fill until track is at least 2× container height.
      // This guarantees the bottom is always covered no matter how few items there are.
      while (track.scrollHeight < containerH * 2) {
        track.insertAdjacentHTML('beforeend', singleSetHTML);
      }

      const SPEED = 0.55; // px per frame ≈ 33 px/s at 60 fps

      const tick = () => {
        if (!pausedRef.current) {
          yRef.current -= SPEED;
          const first = track.firstElementChild;
          if (first) {
            const h = first.getBoundingClientRect().height;
            if (h > 0 && yRef.current <= -h) {
              track.appendChild(first); // recycle to bottom — zero gap
              yRef.current += h;
            }
          }
          track.style.transform = `translateY(${yRef.current}px)`;
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(setupId);
      cancelAnimationFrame(rafRef.current);
    };
  }, [items]);

  const onEnter = useCallback(() => {
    pausedRef.current = true;
    if (hintRef.current) hintRef.current.textContent = 'Paused — move away to resume';
  }, []);

  const onLeave = useCallback(() => {
    pausedRef.current = false;
    if (hintRef.current) hintRef.current.textContent = 'Hover to pause';
  }, []);

  if (items.length === 0) {
    return (
      <div className="card p-0 overflow-hidden h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-oe-border/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-oe-success animate-pulse" />
            <span className="text-sm font-semibold text-oe-text">Announcements</span>
          </div>
          <button onClick={onViewAll} className="text-[11px] text-oe-primary hover:underline flex items-center gap-0.5">
            All <ChevronRight size={11} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center">
          <Megaphone size={22} className="text-oe-muted/30 mb-2" />
          <p className="text-xs text-oe-muted">No announcements yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden h-full flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-oe-border/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-oe-success animate-pulse" />
          <span className="text-sm font-semibold text-oe-text">Announcements</span>
        </div>
        <button onClick={onViewAll} className="text-[11px] text-oe-primary hover:underline flex items-center gap-0.5">
          All <ChevronRight size={11} />
        </button>
      </div>

      {/* ticker window */}
      <div
        className="flex-1 overflow-hidden relative min-h-0"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-oe-card to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-oe-card to-transparent z-10 pointer-events-none" />
        {/* ref div — populated via innerHTML, not React children */}
        <div ref={trackRef} className="text-oe-text" />
      </div>

      {/* hint */}
      <div className="px-4 py-2 border-t border-oe-border/30 flex-shrink-0">
        <p ref={hintRef} className="text-[10px] text-oe-muted/50 text-center">Hover to pause</p>
      </div>
    </div>
  );
}, (prev, next) => prev.items === next.items);

const PRIORITY_ICON_MAP = {
  critical: { icon: ChevronsUp, cls: 'text-red-500' },
  high:     { icon: ChevronUp,  cls: 'text-orange-500' },
  medium:   { icon: Minus,      cls: 'text-amber-500' },
  low:      { icon: ChevronDown, cls: 'text-blue-400' },
};

const STATUS_BADGE = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  on_hold:     'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
};

function DashboardContent() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [myTickets, setMyTickets] = useState([]);
  const router = useRouter();
  const { user } = useAuth();

  // On first login, employees land on announcements (flag set by login page)
  useEffect(() => {
    if (user?.role === 'employee' && typeof window !== 'undefined' && sessionStorage.getItem('hris_just_logged_in') === '1') {
      sessionStorage.removeItem('hris_just_logged_in');
      router.replace('/announcements');
    }
  }, [user, router]);

  const loadData = useCallback(() => {
    setLoading(true);
    dashboardAPI.stats().then(res => setData(res.data)).catch(console.error).finally(() => setLoading(false));
    announcementsAPI.list().then(res => setAnnouncements(res.data || [])).catch(() => {});
    if (user?.id) {
      ticketsAPI.list({ assigned_to: user.id, limit: 10, sort_by: 'priority', sort_order: 'desc' })
        .then(res => {
          const tickets = res.data?.data || [];
          setMyTickets(tickets.filter(t => !['closed', 'resolved'].includes(t.status)));
        })
        .catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time announcement updates via SSE
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('hris_token') : null;
    if (!token) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
    const es = new EventSource(`${API_URL}/announcements/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      if (e.data === 'connected') return;
      try {
        const data = JSON.parse(e.data);
        if (data.__deleted) {
          setAnnouncements(prev => prev.filter(a => a.id !== data.id));
        } else {
          setAnnouncements(prev => prev.some(a => a.id === data.id) ? prev : [data, ...prev]);
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);
  const isAdmin = data?.view === 'admin';

  const statusBadge = (s) => {
    const map = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', cancelled: 'badge-inactive' };
    return <span className={map[s] || 'badge-inactive'}>{s}</span>;
  };

  // ── Personal dashboard for non-HR users ───────────────────────────
  if (!isAdmin) {
    const { stats: ps, recentLeaves: myLeaves } = data || {};
    return (
      <div className="space-y-6">
        {/* Single profile card + Announcements */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <ProfileDive stats={ps} recentLeaves={myLeaves} myTicketCount={myTickets.length} />
          </div>
          <div className="xl:col-span-1 self-start h-80">
            <AnnouncementTicker items={announcements} onViewAll={() => router.push('/announcements')} />
          </div>
        </div>

        {/* My Assigned Tickets */}
        {myTickets.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TicketCheck size={16} className="text-oe-primary" />
                <h3 className="font-semibold text-oe-text">My Assigned Tickets</h3>
                <span className="text-[10px] font-bold bg-oe-primary/10 text-oe-primary px-1.5 py-0.5 rounded-full">{myTickets.length}</span>
              </div>
              <button onClick={() => router.push('/tickets')} className="text-xs text-oe-primary hover:underline flex items-center gap-1">
                View All <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-0 px-2 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-white/35 uppercase tracking-wider">
                <div className="w-5" />
                <div className="w-20">Key</div>
                <div className="flex-1">Summary</div>
                <div className="w-20 text-center hidden sm:block">Status</div>
                <div className="w-20 text-right hidden sm:block">Updated</div>
              </div>
              {myTickets.slice(0, 6).map(t => {
                const pCfg = PRIORITY_ICON_MAP[t.priority] || PRIORITY_ICON_MAP.medium;
                const PIcon = pCfg.icon;
                const sBadge = STATUS_BADGE[t.status] || STATUS_BADGE.open;
                const statusLabel = t.status === 'in_progress' ? 'IN PROGRESS' : t.status === 'on_hold' ? 'ON HOLD' : 'OPEN';
                return (
                  <div key={t.id} onClick={() => router.push(`/tickets/${t.id}`)} className="flex items-center gap-0 px-2 py-2 rounded-lg hover:bg-blue-50/50 dark:hover:bg-white/[0.03] cursor-pointer transition-colors group border-b border-slate-100 dark:border-white/[0.04] last:border-0">
                    <div className="w-5 flex-shrink-0"><PIcon size={13} className={pCfg.cls} strokeWidth={2.5} /></div>
                    <div className="w-20 flex-shrink-0"><span className="text-[11px] font-medium text-oe-primary group-hover:underline">{t.ticket_number}</span></div>
                    <div className="flex-1 min-w-0 pr-2"><span className="text-sm text-slate-800 dark:text-white/90 truncate block">{t.title}</span></div>
                    <div className="w-20 hidden sm:flex justify-center flex-shrink-0"><span className={`inline-flex items-center rounded-sm px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${sBadge}`}>{statusLabel}</span></div>
                    <div className="w-20 hidden sm:block flex-shrink-0 text-right"><span className="text-[10px] text-slate-400 dark:text-white/30">{timeAgo(t.updated_at || t.created_at)}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Admin / HR dashboard ──────────────────────────────────────────
  const { stats, upcomingBirthdays, recentLeaves, recentHires, leaveSummary, deptHeadcount } = data || {};

  return (
    <div className="space-y-6">
      {/* Refresh button — super_admin only */}
      {user?.role === 'super_admin' && (
        <div className="flex justify-end">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-oe-border text-oe-muted hover:text-oe-primary hover:border-oe-primary/30 transition-colors"
            title="Refresh dashboard data"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      )}

      {/* Top section: Profile | Stats | Announcements */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* Col 1 — Profile only */}
        <div className="xl:col-span-1">
          <ProfileDive />
        </div>

        {/* Col 2-3 — 8 stat tiles (2×4) */}
        <div className="xl:col-span-2 grid grid-cols-2 gap-3 content-start">
          <MiniStatCard icon={Users} label="Total Employees" value={stats?.totalEmployees || 0} sub={`${stats?.activeEmployees || 0} active`} color="primary" onClick={() => router.push('/employees')} />
          <MiniStatCard icon={TrendingUp} label="New Hires" value={stats?.newHires || 0} sub="Last 30 days" color="success" onClick={() => router.push('/employees')} />
          <MiniStatCard icon={Calendar} label="On Leave" value={stats?.onLeave || 0} sub={`${stats?.pendingLeaves || 0} pending`} color="warning" onClick={() => router.push('/leaves')} />
          <MiniStatCard icon={DollarSign} label="YTD Payroll" value={fmtCurrency(stats?.ytdPayroll)} sub="Gross this year" color="purple" onClick={() => router.push('/payroll')} />
          <MiniStatCard icon={Building2} label="Departments" value={stats?.departments || 0} sub="Active departments" color="cyan" onClick={() => router.push('/settings')} />
          <MiniStatCard icon={Clock} label="Pending Leaves" value={stats?.pendingLeaves || 0} sub="Awaiting approval" color="warning" onClick={() => router.push('/leaves')} />
          <MiniStatCard icon={Users} label="Active Staff" value={stats?.activeEmployees || 0} sub="Currently active" color="success" />
          <MiniStatCard icon={DollarSign} label="Net Payroll YTD" value={fmtCurrency(stats?.ytdNetPayroll)} sub="Net this year" color="primary" />
        </div>

        {/* Col 4 — Live Announcements ticker */}
        <div className="xl:col-span-1 self-start h-72">
          <AnnouncementTicker items={announcements} onViewAll={() => router.push('/announcements')} />
        </div>

      </div>

{/*═══ MY ASSIGNED TICKETS ═══*/}
      {myTickets.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TicketCheck size={16} className="text-oe-primary" />
              <h3 className="font-semibold text-oe-text">My Assigned Tickets</h3>
              <span className="text-[10px] font-bold bg-oe-primary/10 text-oe-primary px-1.5 py-0.5 rounded-full">{myTickets.length}</span>
            </div>
            <button onClick={() => router.push('/tickets')} className="text-xs text-oe-primary hover:underline flex items-center gap-1">
              View All <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-1">
            {/* Column header */}
            <div className="flex items-center gap-0 px-2 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-white/35 uppercase tracking-wider">
              <div className="w-5" />
              <div className="w-20">Key</div>
              <div className="flex-1">Summary</div>
              <div className="w-20 text-center hidden sm:block">Status</div>
              <div className="w-20 text-right hidden sm:block">Updated</div>
            </div>
            {myTickets.slice(0, 6).map(t => {
              const pCfg = PRIORITY_ICON_MAP[t.priority] || PRIORITY_ICON_MAP.medium;
              const PIcon = pCfg.icon;
              const sBadge = STATUS_BADGE[t.status] || STATUS_BADGE.open;
              const statusLabel = t.status === 'in_progress' ? 'IN PROGRESS' : t.status === 'on_hold' ? 'ON HOLD' : 'OPEN';
              return (
                <div
                  key={t.id}
                  onClick={() => router.push(`/tickets/${t.id}`)}
                  className="flex items-center gap-0 px-2 py-2 rounded-lg hover:bg-blue-50/50 dark:hover:bg-white/[0.03] cursor-pointer transition-colors group border-b border-slate-100 dark:border-white/[0.04] last:border-0"
                >
                  <div className="w-5 flex-shrink-0">
                    <PIcon size={13} className={pCfg.cls} strokeWidth={2.5} />
                  </div>
                  <div className="w-20 flex-shrink-0">
                    <span className="text-[11px] font-medium text-oe-primary group-hover:underline">{t.ticket_number}</span>
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <span className="text-sm text-slate-800 dark:text-white/90 truncate block">{t.title}</span>
                  </div>
                  <div className="w-20 hidden sm:flex justify-center flex-shrink-0">
                    <span className={`inline-flex items-center rounded-sm px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${sBadge}`}>{statusLabel}</span>
                  </div>
                  <div className="w-20 hidden sm:block flex-shrink-0 text-right">
                    <span className="text-[10px] text-slate-400 dark:text-white/30">{timeAgo(t.updated_at || t.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Headcount */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-oe-text">Department Headcount</h3>
            <button onClick={() => router.push('/reports')} className="text-xs text-oe-primary hover:underline flex items-center gap-1">
              View Report <ChevronRight size={12} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptHeadcount?.slice(0, 7)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="code" tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E3A5F', borderRadius: 8, color: '#E8F0FE' }} />
              <Bar dataKey="actual_count" fill="#1D6BE4" radius={[4, 4, 0, 0]} name="Employees" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Leave Summary Pie */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-oe-text">Leave Types (YTD)</h3>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={leaveSummary?.filter(l => parseInt(l.approved) > 0)} dataKey="approved" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                {leaveSummary?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E3A5F', borderRadius: 8, color: '#E8F0FE' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {leaveSummary?.slice(0, 4).map((l, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-oe-muted">{l.name}</span>
                </div>
                <span className="text-oe-text font-medium">{l.approved} approved</span>
              </div>
            ))}
          </div>
        </div>
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leaves */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-oe-text">Recent Leave Requests</h3>
            <button onClick={() => router.push('/leaves')} className="text-xs text-oe-primary hover:underline flex items-center gap-1">
              View All <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {recentLeaves?.slice(0, 5).map(l => (
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-oe-border/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                    {l.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-oe-text">{l.employee_name}</div>
                    <div className="text-xs text-oe-muted">{l.leave_type_name} · {l.total_days}d</div>
                  </div>
                </div>
                {statusBadge(l.status)}
              </div>
            ))}
            {!recentLeaves?.length && <div className="text-oe-muted text-sm text-center py-4">No leave requests</div>}
          </div>
        </div>

        {/* Recent Hires + Birthdays */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-oe-text">Recent Hires</h3>
              <button onClick={() => router.push('/employees')} className="text-xs text-oe-primary hover:underline flex items-center gap-1">
                View All <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {recentHires?.slice(0, 4).map(e => (
                <div key={e.id} className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-oe-surface rounded-lg px-2 -mx-2 transition-colors" onClick={() => router.push(`/employees/${e.id}`)}>
                  <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                    {`${e.first_name?.[0] || ''}${e.last_name?.[0] || ''}`.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-oe-text truncate">{e.first_name} {e.last_name}</div>
                    <div className="text-xs text-oe-muted truncate">{e.position_title} · {e.department_name}</div>
                  </div>
                  <div className="text-xs text-oe-muted">{fmtDate(e.hire_date)}</div>
                </div>
              ))}
            </div>
          </div>

          {upcomingBirthdays?.length > 0 && (
            <div className="card bg-gradient-to-br from-oe-purple/10 to-oe-primary/10 border-oe-purple/20">
              <div className="flex items-center gap-2 mb-3">
                <Gift size={16} className="text-oe-purple" />
                <h3 className="font-semibold text-oe-text text-sm">Upcoming Birthdays</h3>
              </div>
              <div className="space-y-2">
                {upcomingBirthdays.slice(0, 3).map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white">
                      {`${e.first_name?.[0] || ''}`.toUpperCase()}
                    </div>
                    <span className="text-oe-text">{e.first_name} {e.last_name}</span>
                    <span className="text-oe-muted text-xs ml-auto">{fmtDate(e.date_of_birth)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PrivateRoute>
      <Layout>
        <DashboardContent />
      </Layout>
    </PrivateRoute>
  );
}
