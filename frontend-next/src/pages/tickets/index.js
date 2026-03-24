import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import useGoBack from '@/hooks/useGoBack';
import { useToast } from '@/components/common/Toast';
import { ticketsAPI, departmentsAPI } from '@/services/api';
import {
  Plus, Search, LayoutGrid, List, AlertCircle, Clock,
  CheckCircle2, XCircle, Pause, ChevronLeft, ChevronRight, X,
  TicketCheck, Loader2, BarChart3, ChevronsUp, ChevronUp,
  Minus, ChevronDown, Bug, Lightbulb, Wrench, Key, CircleDot,
  MessageSquare, Paperclip, SlidersHorizontal, User2,
} from 'lucide-react';

// ── Jira-style Priority Icons ────────────────────────────────────────────────

const PRIORITY_ICON = {
  critical: { icon: ChevronsUp, cls: 'text-red-500',    bg: 'bg-red-500' },
  high:     { icon: ChevronUp,  cls: 'text-orange-500',  bg: 'bg-orange-500' },
  medium:   { icon: Minus,      cls: 'text-amber-500',   bg: 'bg-amber-500' },
  low:      { icon: ChevronDown,cls: 'text-blue-400',    bg: 'bg-blue-400' },
};

const PriorityIcon = ({ priority, size = 14 }) => {
  const cfg = PRIORITY_ICON[priority];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return <Icon size={size} className={cfg.cls} strokeWidth={2.5} />;
};

// ── Status Config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  open:        { label: 'OPEN',        cls: 'bg-blue-600 text-white',       soft: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',       icon: AlertCircle,   accent: 'border-blue-500' },
  in_progress: { label: 'IN PROGRESS', cls: 'bg-blue-500 text-white',       soft: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30', icon: Clock,         accent: 'border-amber-500' },
  resolved:    { label: 'DONE',        cls: 'bg-emerald-600 text-white',    soft: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30', icon: CheckCircle2, accent: 'border-emerald-500' },
  closed:      { label: 'CLOSED',      cls: 'bg-slate-400 text-white',      soft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/30', icon: XCircle,       accent: 'border-slate-400' },
  on_hold:     { label: 'ON HOLD',     cls: 'bg-orange-500 text-white',     soft: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30', icon: Pause, accent: 'border-orange-500' },
};

const PRIORITY_CFG = {
  low:      { label: 'Low',      cls: 'text-blue-500' },
  medium:   { label: 'Medium',   cls: 'text-amber-500' },
  high:     { label: 'High',     cls: 'text-orange-500' },
  critical: { label: 'Critical', cls: 'text-red-500' },
};

const SLA_CFG = {
  on_track: { label: 'On Track', cls: 'text-emerald-600 dark:text-emerald-400' },
  at_risk:  { label: 'At Risk',  cls: 'text-amber-600 dark:text-amber-400' },
  breached: { label: 'Breached', cls: 'text-red-600 dark:text-red-400' },
};

// ── Category Icons ───────────────────────────────────────────────────────────

const CATEGORY_ICONS = {
  'Bug Report':       { icon: Bug,       cls: 'text-red-500 bg-red-50 dark:bg-red-500/10' },
  'Feature Request':  { icon: Lightbulb, cls: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
  'Technical Issue':  { icon: Wrench,    cls: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' },
  'Access Request':   { icon: Key,       cls: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' },
};

const CategoryIcon = ({ name, size = 14 }) => {
  const cfg = CATEGORY_ICONS[name] || { icon: CircleDot, cls: 'text-slate-400 bg-slate-50 dark:bg-white/5' };
  const Icon = cfg.icon;
  return (
    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${cfg.cls}`} data-tip={name || 'Task'}>
      <Icon size={size} />
    </div>
  );
};

// ── Status Lozenge (Jira-style) ──────────────────────────────────────────────

const StatusLozenge = ({ status, compact }) => {
  const cfg = STATUS_CFG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center rounded-sm font-bold uppercase tracking-wider ${compact ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]'} ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

// ── Avatar ───────────────────────────────────────────────────────────────────

const Avatar = ({ first, last, email, size = 24 }) => {
  const initial = (first?.[0] || email?.[0] || '?').toUpperCase();
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
  const idx = (initial.charCodeAt(0) || 0) % colors.length;
  return (
    <div
      className={`rounded-full ${colors[idx]} text-white flex items-center justify-center font-semibold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      data-tip={first ? `${first} ${last || ''}`.trim() : email || 'Unassigned'}
    >
      {initial}
    </div>
  );
};

// ── Utils ────────────────────────────────────────────────────────────────────

const fmtTimeAgo = (d) => {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const router = useRouter();
  const { user, permissions } = useAuth();
  const goBack = useGoBack('/');
  const { toast } = useToast();
  const [view, setView] = useState('list');
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', department_id: '', category_id: '', priority: 'medium', assigned_to: '' });
  const [formError, setFormError] = useState('');

  // ── Fetch lookup data ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      departmentsAPI.list().catch(() => ({ data: [] })),
      ticketsAPI.categories().catch(() => ({ data: [] })),
      ticketsAPI.assignableUsers().catch(() => ({ data: [] })),
      ticketsAPI.stats().catch(() => ({ data: null })),
    ]).then(([dRes, cRes, uRes, sRes]) => {
      setDepartments(Array.isArray(dRes.data) ? dRes.data : []);
      setCategories(Array.isArray(cRes.data) ? cRes.data : []);
      setAssignableUsers(Array.isArray(uRes.data) ? uRes.data : []);
      if (sRes.data) setStats(sRes.data);
    });
  }, []);

  // ── Fetch tickets ──────────────────────────────────────────────────────
  const fetchTickets = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit, sort_by: 'created_at', sort_order: 'desc' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (deptFilter) params.department_id = deptFilter;
      if (assignedFilter === 'me') params.assigned_to = user?.id;
      else if (assignedFilter === 'unassigned') params.assigned_to = 'unassigned';
      const res = await ticketsAPI.list(params);
      setTickets(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, limit: 25, total: 0, pages: 0 });
    } catch { setTickets([]); }
    finally { setLoading(false); }
  }, [search, statusFilter, priorityFilter, deptFilter, assignedFilter, pagination.limit, user?.id]);

  useEffect(() => { fetchTickets(1); }, [fetchTickets]);

  // ── Create ticket ──────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.title || form.title.length < 5) return setFormError('Title must be at least 5 characters');
    if (!form.description || form.description.length < 10) return setFormError('Description must be at least 10 characters');
    if (!form.department_id) return setFormError('Department is required');
    setCreating(true);
    try {
      const payload = { ...form };
      if (!payload.category_id) delete payload.category_id;
      if (!payload.assigned_to) delete payload.assigned_to;
      const res = await ticketsAPI.create(payload);
      setShowCreate(false);
      setForm({ title: '', description: '', department_id: '', category_id: '', priority: 'medium', assigned_to: '' });
      fetchTickets(1);
      ticketsAPI.stats().then(r => setStats(r.data)).catch(() => {});
      toast.success('Ticket created successfully');
      router.push(`/tickets/${res.data.id}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create ticket';
      setFormError(msg);
      toast.error(msg);
    } finally { setCreating(false); }
  };

  const kanbanColumns = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'];
  const kanbanData = kanbanColumns.reduce((acc, s) => { acc[s] = tickets.filter(t => t.status === s); return acc; }, {});

  const hasFilters = statusFilter || priorityFilter || deptFilter || assignedFilter;

  return (
    <div className="space-y-3">
      {/* ═══ HEADER BAR ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-oe-primary/30 transition-colors"
            title="Back"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <TicketCheck size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Tickets</h1>
            <p className="text-[11px] text-slate-400 dark:text-white/40 leading-tight">
              {stats ? `${stats.total || 0} tickets` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(permissions.isManager || permissions.isHR) && (
            <button onClick={() => router.push('/tickets/analytics')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <BarChart3 size={14} /> Insights
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-oe-primary text-white hover:bg-oe-primary/90 shadow-sm transition-colors">
            <Plus size={14} /> Create
          </button>
        </div>
      </div>

      {/* ═══ QUICK FILTERS BAR ═══ */}
      <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl px-3 py-2.5 space-y-2.5">
        {/* Search + view toggle row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" placeholder="Search..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-oe-primary/40 focus:border-oe-primary outline-none transition-colors"
            />
          </div>

          {/* Quick filter pills */}
          <div className="flex items-center gap-1 flex-wrap flex-1">
            <button
              onClick={() => setAssignedFilter(assignedFilter === 'me' ? '' : 'me')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${assignedFilter === 'me' ? 'border-oe-primary bg-oe-primary/10 text-oe-primary' : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/5'}`}
            >
              <User2 size={11} /> My Issues
            </button>
            {Object.entries(STATUS_CFG).slice(0, 3).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setStatusFilter(statusFilter === k ? '' : k)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${statusFilter === k ? 'border-oe-primary bg-oe-primary/10 text-oe-primary' : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                {v.label}
              </button>
            ))}

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${showAdvanced || hasFilters ? 'border-oe-primary bg-oe-primary/10 text-oe-primary' : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/5'}`}
            >
              <SlidersHorizontal size={11} />
              {hasFilters && <span className="w-1 h-1 rounded-full bg-oe-primary" />}
            </button>
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-md p-0.5 flex-shrink-0">
            <button onClick={() => setView('list')} className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-white dark:bg-white/10 text-oe-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List size={14} /></button>
            <button onClick={() => setView('kanban')} className={`p-1.5 rounded transition-colors ${view === 'kanban' ? 'bg-white dark:bg-white/10 text-oe-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={14} /></button>
          </div>
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-white/80">
              <option value="">All Status</option>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-white/80">
              <option value="">All Priority</option>
              {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-white/80">
              <option value="">All Depts</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.department_name}</option>)}
            </select>
            {hasFilters && (
              <button onClick={() => { setStatusFilter(''); setPriorityFilter(''); setDeptFilter(''); setAssignedFilter(''); }} className="text-[11px] text-red-500 hover:text-red-700 flex items-center gap-1 px-1.5">
                <X size={11} /> Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══ CONTENT ═══ */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-oe-primary" /></div>
      ) : view === 'list' ? (
        /* ═══ LIST / BACKLOG VIEW ═══ */
        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl overflow-hidden">
          {tickets.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-3">
                <TicketCheck size={22} className="text-slate-300 dark:text-white/20" />
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-white/40">No issues found</p>
              <p className="text-xs text-slate-400 dark:text-white/25 mt-1">Try adjusting your filters or create a new ticket</p>
            </div>
          ) : (
            <>
              {/* Column header */}
              <div className="flex items-center gap-0 px-3 py-2 border-b border-slate-200 dark:border-white/8 bg-slate-50/80 dark:bg-white/[0.02] text-[10px] font-semibold text-slate-400 dark:text-white/35 uppercase tracking-wider">
                <div className="w-6" />
                <div className="w-20">Key</div>
                <div className="flex-1">Summary</div>
                <div className="w-24 hidden md:block text-center">Status</div>
                <div className="w-6 hidden sm:block text-center" data-tip="Priority">P</div>
                <div className="w-24 hidden lg:block">Department</div>
                <div className="w-28 hidden md:block">Assignee</div>
                <div className="w-12 hidden sm:block text-center" data-tip="Comments"><MessageSquare size={10} /></div>
                <div className="w-14 hidden sm:block text-right">Updated</div>
              </div>

              {/* Rows */}
              {tickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => router.push(`/tickets/${t.id}`)}
                  className="flex items-center gap-0 px-3 py-2 border-b border-slate-100 dark:border-white/[0.04] hover:bg-blue-50/50 dark:hover:bg-white/[0.03] cursor-pointer transition-colors group"
                >
                  {/* Type icon */}
                  <div className="w-6 flex-shrink-0">
                    <CategoryIcon name={t.category_name} size={12} />
                  </div>

                  {/* Key */}
                  <div className="w-20 flex-shrink-0">
                    <span className="text-xs font-medium text-oe-primary group-hover:underline">{t.ticket_number}</span>
                  </div>

                  {/* Summary */}
                  <div className="flex-1 min-w-0 pr-2">
                    <span className="text-sm text-slate-800 dark:text-white/90 truncate block">{t.title}</span>
                  </div>

                  {/* Status */}
                  <div className="w-24 hidden md:flex justify-center flex-shrink-0">
                    <StatusLozenge status={t.status} compact />
                  </div>

                  {/* Priority */}
                  <div className="w-6 hidden sm:flex justify-center flex-shrink-0">
                    <PriorityIcon priority={t.priority} size={14} />
                  </div>

                  {/* Department */}
                  <div className="w-24 hidden lg:block flex-shrink-0">
                    <span className="text-[11px] text-slate-500 dark:text-white/50 truncate block">{t.department_name || '—'}</span>
                  </div>

                  {/* Assignee */}
                  <div className="w-28 hidden md:flex items-center gap-1.5 flex-shrink-0">
                    {t.assignee_first_name ? (
                      <>
                        <Avatar first={t.assignee_first_name} last={t.assignee_last_name} email={t.assignee_email} size={20} />
                        <span className="text-[11px] text-slate-600 dark:text-white/60 truncate">{t.assignee_first_name}</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-300 dark:text-white/20">Unassigned</span>
                    )}
                  </div>

                  {/* Comment count */}
                  <div className="w-12 hidden sm:flex justify-center flex-shrink-0">
                    {parseInt(t.comment_count) > 0 && (
                      <span className="text-[11px] text-slate-400 dark:text-white/30 flex items-center gap-0.5">
                        <MessageSquare size={10} /> {t.comment_count}
                      </span>
                    )}
                  </div>

                  {/* Updated */}
                  <div className="w-14 hidden sm:block flex-shrink-0 text-right">
                    <span className="text-[10px] text-slate-400 dark:text-white/30">{fmtTimeAgo(t.updated_at || t.created_at)}</span>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/50 dark:bg-white/[0.01]">
                  <span className="text-[11px] text-slate-400 dark:text-white/35">
                    {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </span>
                  <div className="flex items-center gap-1">
                    <button disabled={pagination.page <= 1} onClick={() => fetchTickets(pagination.page - 1)}
                      className="p-1 rounded border border-slate-200 dark:border-white/10 disabled:opacity-20 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"><ChevronLeft size={13} /></button>
                    <button disabled={pagination.page >= pagination.pages} onClick={() => fetchTickets(pagination.page + 1)}
                      className="p-1 rounded border border-slate-200 dark:border-white/10 disabled:opacity-20 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"><ChevronRight size={13} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ═══ KANBAN BOARD VIEW ═══ */
        <div className="flex gap-2.5 overflow-x-auto pb-4 -mx-1 px-1" style={{ minHeight: '450px' }}>
          {kanbanColumns.map(status => {
            const cfg = STATUS_CFG[status];
            const Icon = cfg.icon;
            const items = kanbanData[status] || [];
            return (
              <div key={status} className="flex-shrink-0 w-[272px] bg-slate-100/70 dark:bg-white/[0.025] rounded-lg flex flex-col">
                {/* Column header */}
                <div className="px-2.5 py-2 flex items-center gap-2">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${
                    status === 'open' ? 'text-blue-600' :
                    status === 'in_progress' ? 'text-amber-600' :
                    status === 'resolved' ? 'text-emerald-600' :
                    status === 'on_hold' ? 'text-orange-600' :
                    'text-slate-500 dark:text-white/50'
                  }`}>
                    {cfg.label}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-white/30 bg-slate-200/80 dark:bg-white/8 px-1.5 py-px rounded-full">{items.length}</span>
                </div>

                {/* Cards */}
                <div className="flex-1 px-1.5 pb-1.5 space-y-1.5 overflow-y-auto max-h-[65vh]">
                  {items.length === 0 ? (
                    <div className="text-center py-10 text-[11px] text-slate-400/60 dark:text-white/15">No issues</div>
                  ) : items.map(t => {
                    const pCfg = PRIORITY_ICON[t.priority] || {};
                    return (
                      <div
                        key={t.id}
                        onClick={() => router.push(`/tickets/${t.id}`)}
                        className={`bg-white dark:bg-white/[0.06] rounded-lg border border-slate-200/80 dark:border-white/8 p-2.5 hover:shadow-md dark:hover:border-white/15 cursor-pointer transition-all group border-l-[3px] ${cfg.accent}`}
                      >
                        {/* Title */}
                        <p className="text-[13px] font-medium text-slate-800 dark:text-white/90 leading-snug line-clamp-2 group-hover:text-oe-primary transition-colors">
                          {t.title}
                        </p>

                        {/* Footer row */}
                        <div className="flex items-center justify-between mt-2.5 gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <CategoryIcon name={t.category_name} size={11} />
                            <span className="text-[10px] font-medium text-slate-400 dark:text-white/35">{t.ticket_number}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <PriorityIcon priority={t.priority} size={12} />
                            {t.assignee_first_name ? (
                              <Avatar first={t.assignee_first_name} last={t.assignee_last_name} email={t.assignee_email} size={20} />
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-white/15" />
                            )}
                          </div>
                        </div>

                        {/* SLA warning */}
                        {t.sla_status && t.sla_status !== 'on_track' && (
                          <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-semibold ${SLA_CFG[t.sla_status]?.cls}`}>
                            <Clock size={9} /> SLA {SLA_CFG[t.sla_status]?.label}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ CREATE MODAL (Slide-in Panel) ═══ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-[#1a1b23] shadow-2xl border-l border-slate-200 dark:border-white/10 flex flex-col animate-in slide-in-from-right">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-white/8">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Create Issue</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 transition-colors"><X size={16} /></button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400 px-3 py-2 rounded-lg border border-red-200 dark:border-red-500/20">{formError}</div>}

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1.5">Department *</label>
                <select required value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-1 focus:ring-oe-primary/40 focus:border-oe-primary outline-none">
                  <option value="">Select department...</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.department_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1.5">Summary *</label>
                <input type="text" required minLength={5} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-1 focus:ring-oe-primary/40 focus:border-oe-primary outline-none"
                  placeholder="Summarize the issue" />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1.5">Description *</label>
                <textarea required minLength={10} rows={5} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-1 focus:ring-oe-primary/40 focus:border-oe-primary outline-none resize-y"
                  placeholder="Describe the issue in detail..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1.5">Priority</label>
                  <div className="space-y-1">
                    {Object.entries(PRIORITY_CFG).reverse().map(([k, v]) => (
                      <label key={k} onClick={() => setForm({ ...form, priority: k })}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer transition-colors ${form.priority === k ? 'border-oe-primary bg-oe-primary/5' : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                        <PriorityIcon priority={k} size={14} />
                        <span className="text-xs font-medium text-slate-700 dark:text-white/80">{v.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1.5">Category</label>
                    <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-1 focus:ring-oe-primary/40 focus:border-oe-primary outline-none">
                      <option value="">None</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1.5">Assignee</label>
                    <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-1 focus:ring-oe-primary/40 focus:border-oe-primary outline-none">
                      <option value="">Unassigned</option>
                      {assignableUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.email}
                          {u.role ? ` (${u.role.replace(/_/g, ' ')})` : ''}
                        </option>
                      ))}
                    </select>
                    {user?.role === 'employee' && (
                      <p className="text-[10px] text-slate-400 dark:text-white/30 mt-1">You can assign tickets to fellow employees only</p>
                    )}
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 dark:border-white/8 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/5">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="px-4 py-1.5 text-xs font-medium rounded-md bg-oe-primary text-white hover:bg-oe-primary/90 shadow-sm disabled:opacity-50 flex items-center gap-1.5">
                {creating && <Loader2 size={12} className="animate-spin" />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
