import React, { useState, useEffect, useCallback } from 'react';
import { announcementsAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import {
  Megaphone, Plus, Trash2, AlertCircle, AlertTriangle, Info,
  X, Edit2, Clock, CheckCircle2, Archive, Search, Filter,
  ChevronDown, Users, RefreshCw, Calendar,
} from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Config ────────────────────────────────────────────────────────────────────

const PRIORITY_CFG = {
  urgent: {
    Icon: AlertCircle, label: 'Urgent',
    textCls: 'text-red-500 dark:text-red-400',
    badgeCls: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20',
    borderCls: 'border-l-red-500',
    ringCls: 'ring-red-500/20',
  },
  high: {
    Icon: AlertTriangle, label: 'High',
    textCls: 'text-amber-500 dark:text-amber-400',
    badgeCls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20',
    borderCls: 'border-l-amber-500',
    ringCls: 'ring-amber-500/20',
  },
  normal: {
    Icon: Info, label: 'Normal',
    textCls: 'text-blue-400 dark:text-blue-400',
    badgeCls: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20',
    borderCls: 'border-l-blue-400',
    ringCls: 'ring-blue-500/20',
  },
};

const STATUS_CFG = {
  active:   { label: 'Active',   cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20', dot: 'bg-emerald-500' },
  expired:  { label: 'Expired',  cls: 'bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-white/55 border border-slate-200 dark:border-white/10',                     dot: 'bg-slate-400' },
  archived: { label: 'Archived', cls: 'bg-slate-100 dark:bg-white/8 text-slate-400 dark:text-white/45 border border-slate-200 dark:border-white/10',                     dot: 'bg-slate-300' },
};

const ADMIN_ROLES = ['super_admin', 'hr_admin', 'hr_manager', 'manager'];

// ── Post / Edit Modal ─────────────────────────────────────────────────────────

function AnnouncementModal({ initial, onSave, onClose }) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState({
    title:      initial?.title      || '',
    content:    initial?.content    || '',
    priority:   initial?.priority   || 'normal',
    expires_at: initial?.expires_at ? initial.expires_at.split('T')[0] : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title:      form.title.trim(),
        content:    form.content.trim(),
        priority:   form.priority,
        expires_at: form.expires_at || null,
      };
      const res = isEdit
        ? await announcementsAPI.update(initial.id, payload)
        : await announcementsAPI.create(payload);
      onSave(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save announcement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1a1b23] rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 gradient-bg rounded-lg flex items-center justify-center">
              <Megaphone size={15} className="text-white" />
            </div>
            <h3 className="font-semibold text-oe-text text-sm">
              {isEdit ? 'Edit Announcement' : 'New Announcement'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 text-oe-muted transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Title <span className="text-oe-danger">*</span></label>
            <input
              className="input"
              placeholder="Announcement title..."
              value={form.title}
              maxLength={200}
              onChange={e => set('title', e.target.value)}
            />
            <p className="text-[11px] text-oe-muted/60 mt-1 text-right">{form.title.length}/200</p>
          </div>

          <div>
            <label className="label">Content <span className="text-oe-danger">*</span></label>
            <textarea
              className="input resize-none"
              rows={5}
              placeholder="Write your announcement here..."
              value={form.content}
              onChange={e => set('content', e.target.value)}
            />
            <p className="text-[11px] text-oe-muted/60 mt-1">{form.content.length} characters</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="label">Expires On <span className="text-oe-muted/50 text-[11px]">(optional)</span></label>
              <input
                type="date"
                className="input"
                value={form.expires_at}
                onChange={e => set('expires_at', e.target.value)}
              />
            </div>
          </div>

          {/* Priority preview */}
          {form.priority !== 'normal' && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
              form.priority === 'urgent'
                ? 'bg-red-50 dark:bg-red-500/8 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                : 'bg-amber-50 dark:bg-amber-500/8 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
            }`}>
              {form.priority === 'urgent' ? <AlertCircle size={13} /> : <AlertTriangle size={13} />}
              This will be highlighted as a <strong>{form.priority}</strong> priority announcement.
            </div>
          )}

          {error && (
            <p className="text-xs text-oe-danger flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-2">
              {saving ? (
                <><RefreshCw size={13} className="animate-spin" /> {isEdit ? 'Saving...' : 'Posting...'}</>
              ) : (
                <>{isEdit ? <Edit2 size={13} /> : <Plus size={13} />} {isEdit ? 'Save Changes' : 'Post Announcement'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Announcement Card ─────────────────────────────────────────────────────────

function AnnouncementCard({ item, canManage, onEdit, onArchive, onRestore, isAdmin }) {
  const p = PRIORITY_CFG[item.priority] || PRIORITY_CFG.normal;
  const s = STATUS_CFG[item.computed_status] || STATUS_CFG.active;
  const Icon = p.Icon;
  const isArchived = item.computed_status === 'archived';
  const isExpired  = item.computed_status === 'expired';

  return (
    <div className={`bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl overflow-hidden border-l-4 ${p.borderCls} transition-all hover:shadow-md dark:hover:shadow-black/20 ${isArchived || isExpired ? 'opacity-60' : ''}`}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          {/* Priority icon */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
            item.priority === 'urgent' ? 'bg-red-50 dark:bg-red-500/10' :
            item.priority === 'high'   ? 'bg-amber-50 dark:bg-amber-500/10' :
                                         'bg-blue-50 dark:bg-blue-500/10'
          }`}>
            <Icon size={15} className={p.textCls} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Title + badges + actions */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="font-semibold text-oe-text text-sm leading-snug">{item.title}</h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${p.badgeCls}`}>
                  {p.label}
                </span>
                {isAdmin && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap ${s.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              {canManage && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!isArchived && (
                    <button
                      onClick={() => onEdit(item)}
                      className="p-1.5 rounded-lg text-oe-muted hover:text-oe-primary hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={13} />
                    </button>
                  )}
                  {isArchived ? (
                    <button
                      onClick={() => onRestore(item)}
                      className="p-1.5 rounded-lg text-oe-muted hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                      title="Restore"
                    >
                      <RefreshCw size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={() => onArchive(item)}
                      className="p-1.5 rounded-lg text-oe-muted hover:text-oe-danger hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      title="Archive"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Content */}
            <p className="text-sm text-oe-muted mt-2 leading-relaxed whitespace-pre-wrap">{item.content}</p>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <div className="flex items-center gap-1 text-[11px] text-oe-muted/70">
                <Clock size={10} />
                <span>{timeAgo(item.created_at)}</span>
              </div>
              {item.posted_by_name && (
                <div className="flex items-center gap-1 text-[11px] text-oe-muted/70">
                  <Users size={10} />
                  <span>{item.posted_by_name}</span>
                </div>
              )}
              {item.expires_at && (
                <div className={`flex items-center gap-1 text-[11px] ${isExpired ? 'text-red-400 dark:text-red-400' : 'text-oe-muted/70'}`}>
                  <Calendar size={10} />
                  <span>{isExpired ? 'Expired' : 'Expires'} {fmtDate(item.expires_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page Content ─────────────────────────────────────────────────────────

function AnnouncementsContent() {
  const { user } = useAuth();
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('active');
  const [search, setSearch]       = useState('');
  const [filterPriority, setFP]   = useState('all');
  const [modal, setModal]         = useState(null); // null | 'create' | item object (edit)

  const isAdmin   = ADMIN_ROLES.includes(user?.role);
  const canManage = isAdmin;

  // Load announcements
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = canManage ? { manage: true } : {};
      const res = await announcementsAPI.list(params);
      setItems(res.data || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { load(); }, [load]);

  // SSE real-time updates
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('hris_token') : null;
    if (!token) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
    const es = new EventSource(`${API_URL}/announcements/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      if (e.data === 'connected') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.__type === 'created') {
          setItems(prev => prev.some(a => a.id === msg.announcement.id) ? prev : [msg.announcement, ...prev]);
        } else if (msg.__type === 'updated') {
          setItems(prev => prev.map(a => a.id === msg.announcement.id ? msg.announcement : a));
          // If not admin and announcement was updated to expired/archived, remove it
          if (!canManage) {
            setItems(prev => prev.filter(a =>
              a.computed_status === 'active'
            ));
          }
        } else if (msg.__type === 'deleted') {
          if (canManage) {
            setItems(prev => prev.map(a => a.id === msg.id ? { ...a, is_active: false, computed_status: 'archived' } : a));
          } else {
            setItems(prev => prev.filter(a => a.id !== msg.id));
          }
        }
      } catch {}
    };
    return () => es.close();
  }, [canManage]);

  // Handlers
  const handleSaved = (announcement) => {
    setItems(prev => {
      const exists = prev.find(a => a.id === announcement.id);
      if (exists) return prev.map(a => a.id === announcement.id ? announcement : a);
      return [announcement, ...prev];
    });
  };

  const handleArchive = async (item) => {
    if (!confirm(`Archive "${item.title}"? It will no longer be visible to employees.`)) return;
    try {
      await announcementsAPI.delete(item.id);
      setItems(prev => prev.map(a => a.id === item.id ? { ...a, is_active: false, computed_status: 'archived' } : a));
    } catch { /* non-fatal */ }
  };

  const handleRestore = async (item) => {
    try {
      const res = await announcementsAPI.update(item.id, { is_active: true });
      setItems(prev => prev.map(a => a.id === item.id ? res.data : a));
    } catch { /* non-fatal */ }
  };

  // Derived counts (for tabs)
  const counts = items.reduce((acc, a) => {
    acc[a.computed_status] = (acc[a.computed_status] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, {});

  // Filtered list
  const visible = items.filter(a => {
    if (canManage) {
      if (tab !== 'all' && a.computed_status !== tab) return false;
    }
    if (filterPriority !== 'all' && a.priority !== filterPriority) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.content.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats for admin header cards
  const activeCount  = counts.active  || 0;
  const expiredCount = counts.expired || 0;
  const archivedCnt  = counts.archived || 0;
  const urgentCount  = items.filter(a => a.priority === 'urgent' && a.computed_status === 'active').length;

  return (
    <div className="space-y-5">

      {/* ═══ PAGE HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
            <Megaphone size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-oe-text">Announcements</h1>
            <p className="text-sm text-oe-muted">
              {canManage ? 'Manage company-wide announcements' : 'Company-wide updates and notices'}
            </p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Post Announcement
          </button>
        )}
      </div>

      {/* ═══ ADMIN STAT CARDS ═══ */}
      {canManage && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active',   value: activeCount,  icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
            { label: 'Urgent',   value: urgentCount,  icon: AlertCircle,  color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-500/10' },
            { label: 'Expired',  value: expiredCount, icon: Clock,        color: 'text-slate-400',   bg: 'bg-slate-100 dark:bg-white/8' },
            { label: 'Archived', value: archivedCnt,  icon: Archive,      color: 'text-slate-400',   bg: 'bg-slate-100 dark:bg-white/8' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${bg}`}>
                <Icon size={17} className={color} />
              </div>
              <div>
                <div className="text-xl font-bold text-oe-text leading-none">{value}</div>
                <div className="text-xs text-oe-muted mt-0.5">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ FILTERS + SEARCH ═══ */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">

        {/* Tabs (admin only) */}
        {canManage && (
          <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-lg p-0.5 flex-shrink-0">
            {[
              { key: 'active',   label: 'Active'   },
              { key: 'expired',  label: 'Expired'  },
              { key: 'archived', label: 'Archived' },
              { key: 'all',      label: 'All'      },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? 'bg-white dark:bg-white/10 text-oe-text shadow-sm'
                    : 'text-oe-muted hover:text-oe-text'
                }`}
              >
                {t.label}
                {counts[t.key] > 0 && (
                  <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-px rounded-full ${
                    tab === t.key ? 'bg-oe-primary/15 text-oe-primary' : 'bg-slate-200 dark:bg-white/10 text-oe-muted'
                  }`}>
                    {t.key === 'all' ? counts.all || 0 : counts[t.key] || 0}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted pointer-events-none" />
            <input
              className="input pl-8 text-sm py-1.5"
              placeholder="Search announcements..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Priority filter */}
          <div className="relative flex-shrink-0">
            <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-oe-muted pointer-events-none" />
            <select
              className="input pl-7 pr-7 text-xs py-1.5 cursor-pointer appearance-none"
              value={filterPriority}
              onChange={e => setFP(e.target.value)}
            >
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-oe-muted pointer-events-none" />
          </div>

          {/* Refresh */}
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-oe-muted hover:text-oe-primary hover:border-oe-primary/30 transition-colors flex-shrink-0"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-4">
            <Megaphone size={26} className="text-slate-300 dark:text-white/20" />
          </div>
          <p className="font-medium text-oe-text">
            {search || filterPriority !== 'all' ? 'No results found' : 'No announcements yet'}
          </p>
          <p className="text-sm text-oe-muted mt-1">
            {search || filterPriority !== 'all'
              ? 'Try adjusting your filters'
              : canManage
              ? 'Post the first announcement to keep your team informed.'
              : 'Check back later for company updates.'}
          </p>
          {canManage && !search && filterPriority === 'all' && (
            <button onClick={() => setModal('create')} className="btn-primary text-sm mt-4 flex items-center gap-2">
              <Plus size={14} /> Post Announcement
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(a => (
            <AnnouncementCard
              key={a.id}
              item={a}
              canManage={canManage}
              isAdmin={canManage}
              onEdit={setModal}
              onArchive={handleArchive}
              onRestore={handleRestore}
            />
          ))}
        </div>
      )}

      {/* ═══ MODAL ═══ */}
      {modal && (
        <AnnouncementModal
          initial={modal === 'create' ? null : modal}
          onSave={handleSaved}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  return (
    <PrivateRoute>
      <Layout>
        <AnnouncementsContent />
      </Layout>
    </PrivateRoute>
  );
}
