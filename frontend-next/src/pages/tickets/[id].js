import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/common/Toast';
import { ticketsAPI, departmentsAPI } from '@/services/api';
import {
  ArrowLeft, Clock, AlertCircle, CheckCircle2, XCircle, Pause,
  MessageSquare, Paperclip, Activity, Send, Loader2, Upload,
  Trash2, Download, Eye, EyeOff, RotateCcw, X, FileText,
  ChevronsUp, ChevronUp, Minus, ChevronDown, Bug, Lightbulb,
  Wrench, Key, CircleDot, User2, Calendar, Tag, Building2,
  ArrowRight, TicketCheck, ChevronRight,
} from 'lucide-react';

// ── Shared Config ────────────────────────────────────────────────────────────

const PRIORITY_ICON = {
  critical: { icon: ChevronsUp, cls: 'text-red-500',    label: 'Critical' },
  high:     { icon: ChevronUp,  cls: 'text-orange-500',  label: 'High' },
  medium:   { icon: Minus,      cls: 'text-amber-500',   label: 'Medium' },
  low:      { icon: ChevronDown,cls: 'text-blue-400',    label: 'Low' },
};

const PriorityIcon = ({ priority, size = 14, showLabel }) => {
  const cfg = PRIORITY_ICON[priority];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon size={size} className={cfg.cls} strokeWidth={2.5} />
      {showLabel && <span className={`text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>}
    </span>
  );
};

const STATUS_CFG = {
  open:        { label: 'OPEN',        cls: 'bg-blue-600 text-white',    btnCls: 'bg-blue-600 hover:bg-blue-700 text-white',   icon: AlertCircle },
  in_progress: { label: 'IN PROGRESS', cls: 'bg-blue-500 text-white',    btnCls: 'bg-blue-500 hover:bg-blue-600 text-white',   icon: Clock },
  resolved:    { label: 'DONE',        cls: 'bg-emerald-600 text-white', btnCls: 'bg-emerald-600 hover:bg-emerald-700 text-white', icon: CheckCircle2 },
  closed:      { label: 'CLOSED',      cls: 'bg-slate-400 text-white',   btnCls: 'bg-slate-500 hover:bg-slate-600 text-white', icon: XCircle },
  on_hold:     { label: 'ON HOLD',     cls: 'bg-orange-500 text-white',  btnCls: 'bg-orange-500 hover:bg-orange-600 text-white', icon: Pause },
};

const SLA_CFG = {
  on_track: { label: 'On Track', cls: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  at_risk:  { label: 'At Risk',  cls: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-500/10' },
  breached: { label: 'Breached', cls: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-500/10' },
};

const CATEGORY_ICONS = {
  'Bug Report':      { icon: Bug,       cls: 'text-red-500 bg-red-50 dark:bg-red-500/10' },
  'Feature Request': { icon: Lightbulb, cls: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
  'Technical Issue': { icon: Wrench,    cls: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' },
  'Access Request':  { icon: Key,       cls: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' },
};

const StatusLozenge = ({ status }) => {
  const cfg = STATUS_CFG[status];
  if (!cfg) return null;
  return <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.cls}`}>{cfg.label}</span>;
};

const Avatar = ({ first, last, email, size = 28 }) => {
  const initial = (first?.[0] || email?.[0] || '?').toUpperCase();
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
  const idx = (initial.charCodeAt(0) || 0) % colors.length;
  return (
    <div className={`rounded-full ${colors[idx]} text-white flex items-center justify-center font-semibold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initial}
    </div>
  );
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDateShort = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtName = (first, last, email) => first ? `${first} ${last || ''}`.trim() : email || '—';
const fmtFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
};
const fmtTimeAgo = (d) => {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
};

const ACTIVITY_LABELS = {
  created: 'created this issue',
  assigned: 'assigned',
  reassigned: 'reassigned',
  status_changed: 'changed status',
  priority_changed: 'changed priority',
  commented: 'added a comment',
  resolved: 'resolved this issue',
  closed: 'closed this issue',
  reopened: 'reopened this issue',
  attachment_added: 'attached a file',
  deleted: 'deleted this issue',
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, permissions } = useAuth();
  const { toast } = useToast();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activityTab, setActivityTab] = useState('all'); // all | comments | history

  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);

  const [commentText, setCommentText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [showResolve, setShowResolve] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [actionNotes, setActionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const isStaff = ['super_admin', 'hr_admin', 'hr_manager', 'manager', 'team_lead'].includes(user?.role);

  useEffect(() => {
    if (!id) return;
    fetchTicket();
    Promise.all([
      departmentsAPI.list().catch(() => ({ data: [] })),
      ticketsAPI.categories().catch(() => ({ data: [] })),
      ticketsAPI.assignableUsers().catch(() => ({ data: [] })),
    ]).then(([dRes, cRes, uRes]) => {
      setDepartments(Array.isArray(dRes.data) ? dRes.data : []);
      setCategories(Array.isArray(cRes.data) ? cRes.data : []);
      setAssignableUsers(Array.isArray(uRes.data) ? uRes.data : []);
    });
  }, [id]);

  const fetchTicket = async () => {
    try { const res = await ticketsAPI.get(id); setTicket(res.data); }
    catch { router.push('/tickets'); }
    finally { setLoading(false); }
  };

  const updateField = async (field, value) => {
    setUpdating(true);
    try { await ticketsAPI.update(id, { [field]: value }); await fetchTicket(); toast.success('Updated successfully'); }
    catch (err) { toast.error(err.response?.data?.error || 'Update failed'); }
    finally { setUpdating(false); }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await ticketsAPI.addComment(id, { comment_text: commentText, is_internal: isInternal });
      setCommentText(''); setIsInternal(false); await fetchTicket();
      toast.success('Comment added');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add comment'); }
    finally { setSubmittingComment(false); }
  };

  const deleteComment = async (cId) => {
    if (!confirm('Delete this comment?')) return;
    try { await ticketsAPI.deleteComment(id, cId); await fetchTicket(); toast.success('Comment deleted'); } catch { toast.error('Failed to delete comment'); }
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('File size must be under 5MB');
    setUploading(true);
    try { const fd = new FormData(); fd.append('file', file); await ticketsAPI.uploadAttachment(id, fd); await fetchTicket(); toast.success('File attached'); }
    catch (err) { toast.error(err.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const downloadFile = async (att) => {
    try {
      const res = await ticketsAPI.downloadAttachment(id, att.id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = att.file_name; a.click(); window.URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const deleteAttachment = async (aId) => {
    if (!confirm('Delete?')) return;
    try { await ticketsAPI.deleteAttachment(id, aId); await fetchTicket(); toast.success('Attachment deleted'); } catch { toast.error('Failed to delete'); }
  };

  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      if (action === 'resolve') await ticketsAPI.resolve(id, { resolution_notes: actionNotes });
      else if (action === 'close') await ticketsAPI.close(id, { closing_notes: actionNotes });
      else if (action === 'reopen') await ticketsAPI.reopen(id, { reason: actionNotes });
      setShowResolve(false); setShowClose(false); setShowReopen(false); setActionNotes('');
      await fetchTicket();
      toast.success(action === 'resolve' ? 'Issue resolved' : action === 'close' ? 'Issue closed' : 'Issue reopened');
    } catch (err) { toast.error(err.response?.data?.error || 'Action failed'); }
    finally { setActionLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-oe-primary" /></div>;
  if (!ticket) return null;

  const sCfg = STATUS_CFG[ticket.status] || {};
  const slaCfg = SLA_CFG[ticket.sla_status];
  const catCfg = CATEGORY_ICONS[ticket.category_name] || { icon: CircleDot, cls: 'text-slate-400 bg-slate-50 dark:bg-white/5' };
  const CatIcon = catCfg.icon;

  // Build unified activity stream
  const commentItems = (ticket.comments || []).map(c => ({ ...c, _type: 'comment', _time: new Date(c.created_at) }));
  const activityItems = (ticket.activity_log || []).map(a => ({ ...a, _type: 'activity', _time: new Date(a.changed_at) }));
  let allItems = [...commentItems, ...activityItems].sort((a, b) => a._time - b._time);
  if (activityTab === 'comments') allItems = allItems.filter(i => i._type === 'comment');
  if (activityTab === 'history') allItems = allItems.filter(i => i._type === 'activity');

  // Workflow transitions
  const transitions = [];
  if (ticket.status === 'open') transitions.push({ to: 'in_progress', label: 'Start Progress' });
  if (ticket.status === 'in_progress') transitions.push({ to: 'open', label: 'Stop Progress' }, { to: 'on_hold', label: 'Hold' });
  if (ticket.status === 'on_hold') transitions.push({ to: 'in_progress', label: 'Resume' });
  if (!['resolved', 'closed'].includes(ticket.status)) transitions.push({ to: 'resolve', label: 'Done', primary: true });
  if (['resolved', 'closed'].includes(ticket.status)) transitions.push({ to: 'reopen', label: 'Reopen' });

  return (
    <div className="space-y-3">
      {/* ═══ BACK BUTTON + BREADCRUMB ═══ */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/tickets')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/85 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-oe-primary/30 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-white/95">
          <button onClick={() => router.push('/tickets')} className="hover:text-oe-primary transition-colors flex items-center gap-1">
            <TicketCheck size={12} /> Tickets
          </button>
          <ChevronRight size={12} />
          <div className={`w-4 h-4 rounded flex items-center justify-center ${catCfg.cls}`}><CatIcon size={10} /></div>
          <span className="font-medium text-slate-600 dark:text-white/85">{ticket.ticket_number}</span>
        </div>
      </div>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* ── Left: Main Content ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Title */}
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white leading-snug">{ticket.title}</h1>

          {/* Status transition bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusLozenge status={ticket.status} />
            {transitions.map(tr => (
              <button
                key={tr.to}
                onClick={() => {
                  if (tr.to === 'resolve') { setShowResolve(true); return; }
                  if (tr.to === 'reopen') { setShowReopen(true); return; }
                  updateField('status', tr.to);
                }}
                disabled={updating}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-sm transition-colors disabled:opacity-40 ${
                  tr.primary
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-white/85 hover:bg-slate-200 dark:hover:bg-white/12'
                }`}
              >
                {tr.label}
              </button>
            ))}
            {ticket.status !== 'closed' && !['resolved', 'closed'].includes(ticket.status) && (
              <button onClick={() => setShowClose(true)} className="px-2.5 py-1 text-[11px] font-semibold rounded-sm bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-white/85 hover:bg-slate-200 dark:hover:bg-white/12 transition-colors">
                Close
              </button>
            )}
            {permissions.isHR && (
              <button onClick={async () => { if (confirm('Delete?')) { await ticketsAPI.delete(id); router.push('/tickets'); } }}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors ml-auto">
                Delete
              </button>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 dark:text-white/85 uppercase tracking-wider">Description</h3>
            <div className="text-sm text-slate-700 dark:text-white/95 whitespace-pre-wrap leading-relaxed bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-lg p-4">
              {ticket.description || <span className="italic text-slate-400 dark:text-white/85">No description provided.</span>}
            </div>
          </div>

          {/* SLA Bar */}
          {slaCfg && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md ${slaCfg.bg} border ${
              ticket.sla_status === 'breached' ? 'border-red-200 dark:border-red-500/20' :
              ticket.sla_status === 'at_risk' ? 'border-amber-200 dark:border-amber-500/20' :
              'border-emerald-200 dark:border-emerald-500/20'
            }`}>
              <Clock size={13} className={slaCfg.cls} />
              <span className={`text-xs font-semibold ${slaCfg.cls}`}>SLA: {slaCfg.label}</span>
              {ticket.sla_due_at && <span className="text-xs text-slate-500 dark:text-white/95 ml-auto">Due {fmtDate(ticket.sla_due_at)}</span>}
            </div>
          )}

          {/* Attachments section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 dark:text-white/85 uppercase tracking-wider flex items-center gap-1.5">
                <Paperclip size={12} /> Attachments
                {(ticket.attachments || []).length > 0 && <span className="text-[10px] bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-white/85 px-1.5 py-px rounded-full font-bold">{ticket.attachments.length}</span>}
              </h3>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="text-[11px] font-medium text-oe-primary hover:text-oe-primary/80 flex items-center gap-1 transition-colors">
                {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Attach
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={uploadFile} accept=".png,.jpg,.jpeg,.gif,.pdf,.doc,.docx,.txt,.xlsx,.xls" />
            </div>
            {(ticket.attachments || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {ticket.attachments.map(a => (
                  <div key={a.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 group hover:border-oe-primary/30 transition-colors">
                    <FileText size={14} className="text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <button onClick={() => downloadFile(a)} className="text-xs font-medium text-oe-primary hover:underline truncate block max-w-[140px]">{a.file_name}</button>
                      <span className="text-[10px] text-slate-400 dark:text-white/85">{fmtFileSize(a.file_size)}</span>
                    </div>
                    {(a.uploaded_by === user?.id || permissions.isHR) && (
                      <button onClick={() => deleteAttachment(a.id)} className="p-0.5 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={11} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ ACTIVITY STREAM ═══ */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-bold text-slate-500 dark:text-white/85 uppercase tracking-wider">Activity</h3>
              <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-md p-0.5">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'comments', label: 'Comments' },
                  { key: 'history', label: 'History' },
                ].map(t => (
                  <button key={t.key} onClick={() => setActivityTab(t.key)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${activityTab === t.key ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm' : 'text-slate-400 dark:text-white/95 hover:text-slate-600'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment input (always visible, Jira-style) */}
            <div className="flex gap-3">
              <Avatar first={user?.firstName} last={user?.lastName} email={user?.email} size={28} />
              <form onSubmit={submitComment} className="flex-1">
                <div className="border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden focus-within:border-oe-primary/40 focus-within:ring-1 focus-within:ring-oe-primary/20 transition-all">
                  <textarea rows={2} value={commentText} onChange={e => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full px-3 py-2 text-sm bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none resize-y" />
                  {commentText.trim() && (
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-white/[0.03] border-t border-slate-100 dark:border-white/5">
                      {isStaff && (
                        <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-white/85 cursor-pointer">
                          <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded border-slate-300 w-3 h-3" />
                          {isInternal ? <EyeOff size={10} /> : <Eye size={10} />} Internal
                        </label>
                      )}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button type="button" onClick={() => { setCommentText(''); setIsInternal(false); }} className="text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
                        <button type="submit" disabled={submittingComment}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded bg-oe-primary text-white hover:bg-oe-primary/90 disabled:opacity-40 flex items-center gap-1">
                          {submittingComment ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </div>

            {/* Activity items */}
            <div className="space-y-0">
              {allItems.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-white/85 text-center py-8">No activity yet</p>
              )}
              {allItems.map((item, i) => (
                <div key={item.id} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-slate-100 dark:border-white/[0.04]' : ''}`}>
                  {item._type === 'comment' ? (
                    /* Comment */
                    <>
                      <Avatar first={item.author_first_name} last={item.author_last_name} email={item.author_email} size={28} />
                      <div className={`flex-1 min-w-0 ${item.is_internal ? 'bg-amber-50/60 dark:bg-amber-500/5 -mx-2 px-2 py-2 rounded-lg border border-amber-200/40 dark:border-amber-500/10' : ''}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-800 dark:text-white/95">{fmtName(item.author_first_name, item.author_last_name, item.author_email)}</span>
                          <span className="text-[11px] text-slate-400 dark:text-white/85">{fmtTimeAgo(item.created_at)}</span>
                          {item.is_internal && <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20 px-1.5 py-px rounded uppercase tracking-wider">Internal</span>}
                          {(item.user_id === user?.id || permissions.isHR) && (
                            <button onClick={() => deleteComment(item.id)} className="ml-auto text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={11} /></button>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 dark:text-white/85 mt-1 whitespace-pre-wrap leading-relaxed">{item.comment_text}</p>
                      </div>
                    </>
                  ) : (
                    /* Activity log entry */
                    <>
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Activity size={12} className="text-slate-400 dark:text-white/85" />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap text-xs py-1">
                        <span className="font-medium text-slate-700 dark:text-white/85">{fmtName(item.changed_by_first_name, item.changed_by_last_name, item.changed_by_email)}</span>
                        <span className="text-slate-400 dark:text-white/95">{ACTIVITY_LABELS[item.action] || item.action}</span>
                        {item.old_value && item.new_value && (
                          <span className="text-slate-400 dark:text-white/85">
                            <span className="line-through">{item.old_value}</span>
                            <ArrowRight size={10} className="inline mx-0.5" />
                            <span className="font-medium text-slate-600 dark:text-white/95">{item.new_value}</span>
                          </span>
                        )}
                        {!item.old_value && item.new_value && item.action !== 'commented' && (
                          <span className="text-slate-500 dark:text-white/95 font-medium">{item.new_value}</span>
                        )}
                        <span className="text-[10px] text-slate-300 dark:text-white/95 ml-1">{fmtTimeAgo(item.changed_at)}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Details Panel (Jira-style) ── */}
        <div className="w-full lg:w-64 xl:w-72 flex-shrink-0">
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl divide-y divide-slate-100 dark:divide-white/[0.05] sticky top-4">
            {/* Status */}
            <DetailRow label="Status" icon={<AlertCircle size={12} />}>
              <select value={ticket.status} onChange={e => updateField('status', e.target.value)} disabled={updating || ticket.status === 'closed'}
                className="text-xs font-medium px-2 py-1 rounded-sm border-0 bg-transparent text-slate-700 dark:text-white/95 focus:ring-0 cursor-pointer -mr-1 disabled:opacity-50">
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </DetailRow>

            {/* Priority */}
            <DetailRow label="Priority" icon={<ChevronsUp size={12} />}>
              <div className="flex items-center gap-1.5">
                <PriorityIcon priority={ticket.priority} size={13} />
                <select value={ticket.priority} onChange={e => updateField('priority', e.target.value)} disabled={updating}
                  className="text-xs font-medium px-1 py-1 rounded-sm border-0 bg-transparent text-slate-700 dark:text-white/95 focus:ring-0 cursor-pointer -mr-1 disabled:opacity-50">
                  {Object.keys(PRIORITY_ICON).map(k => <option key={k} value={k}>{PRIORITY_ICON[k].label}</option>)}
                </select>
              </div>
            </DetailRow>

            {/* Assignee */}
            <DetailRow label="Assignee" icon={<User2 size={12} />}>
              <div className="flex items-center gap-1.5">
                {ticket.assigned_to && ticket.assignee_first_name && <Avatar first={ticket.assignee_first_name} last={ticket.assignee_last_name} email={ticket.assignee_email} size={20} />}
                <select value={ticket.assigned_to || ''} onChange={e => updateField('assigned_to', e.target.value || null)} disabled={updating}
                  className="text-xs font-medium px-1 py-1 rounded-sm border-0 bg-transparent text-slate-700 dark:text-white/95 focus:ring-0 cursor-pointer -mr-1 truncate max-w-[120px] disabled:opacity-50">
                  <option value="">Unassigned</option>
                  {assignableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.email}
                      {u.role ? ` (${u.role.replace(/_/g, ' ')})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </DetailRow>

            {/* Reporter */}
            <DetailRow label="Reporter" icon={<User2 size={12} />}>
              <div className="flex items-center gap-1.5">
                <Avatar first={ticket.creator_first_name} last={ticket.creator_last_name} email={ticket.creator_email} size={20} />
                <span className="text-xs text-slate-700 dark:text-white/95 truncate">{fmtName(ticket.creator_first_name, ticket.creator_last_name, ticket.creator_email)}</span>
              </div>
            </DetailRow>

            {/* Category */}
            <DetailRow label="Category" icon={<Tag size={12} />}>
              <div className="flex items-center gap-1.5">
                <div className={`w-4 h-4 rounded flex items-center justify-center ${catCfg.cls}`}><CatIcon size={9} /></div>
                <select value={ticket.category_id || ''} onChange={e => updateField('category_id', e.target.value || null)} disabled={updating}
                  className="text-xs font-medium px-1 py-1 rounded-sm border-0 bg-transparent text-slate-700 dark:text-white/95 focus:ring-0 cursor-pointer -mr-1 truncate max-w-[110px] disabled:opacity-50">
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </DetailRow>

            {/* Department */}
            <DetailRow label="Department" icon={<Building2 size={12} />}>
              <select value={ticket.department_id || ''} onChange={e => updateField('department_id', e.target.value)} disabled={updating}
                className="text-xs font-medium px-1 py-1 rounded-sm border-0 bg-transparent text-slate-700 dark:text-white/95 focus:ring-0 cursor-pointer -mr-1 truncate max-w-[130px] disabled:opacity-50">
                {departments.map(d => <option key={d.id} value={d.id}>{d.department_name}</option>)}
              </select>
            </DetailRow>

            {/* SLA Due */}
            {ticket.sla_due_at && (
              <DetailRow label="SLA Due" icon={<Clock size={12} />}>
                <span className={`text-xs font-medium ${slaCfg?.cls || 'text-slate-700 dark:text-white/95'}`}>
                  {fmtDateShort(ticket.sla_due_at)}
                </span>
              </DetailRow>
            )}

            {/* Dates */}
            <DetailRow label="Created" icon={<Calendar size={12} />}>
              <span className="text-xs text-slate-600 dark:text-white/95">{fmtDateShort(ticket.created_at)}</span>
            </DetailRow>

            <DetailRow label="Updated" icon={<Calendar size={12} />}>
              <span className="text-xs text-slate-600 dark:text-white/95">{fmtTimeAgo(ticket.updated_at)}</span>
            </DetailRow>

            {ticket.resolved_at && (
              <DetailRow label="Resolved" icon={<CheckCircle2 size={12} />}>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">{fmtDateShort(ticket.resolved_at)}</span>
              </DetailRow>
            )}

            {/* Internal Notes */}
            {isStaff && ticket.internal_notes && (
              <div className="px-3.5 py-3">
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Internal Notes</span>
                <p className="text-[11px] text-slate-500 dark:text-white/65 whitespace-pre-wrap mt-1 leading-relaxed">{ticket.internal_notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ACTION MODALS ═══ */}
      {(showResolve || showClose || showReopen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={() => { setShowResolve(false); setShowClose(false); setShowReopen(false); }} />
          <div className="relative bg-white dark:bg-[#1a1b23] rounded-lg shadow-2xl w-full max-w-md border border-slate-200 dark:border-white/10">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/8">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {showResolve ? 'Resolve Issue' : showClose ? 'Close Issue' : 'Reopen Issue'}
              </h3>
            </div>
            <div className="p-5">
              <textarea rows={3} value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                placeholder={showResolve ? 'Resolution notes (optional)...' : showClose ? 'Closing reason (optional)...' : 'Why are you reopening this? (optional)'}
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-oe-primary/40 focus:border-oe-primary outline-none resize-y" />
            </div>
            <div className="px-5 py-3 border-t border-slate-100 dark:border-white/5 flex justify-end gap-2">
              <button onClick={() => { setShowResolve(false); setShowClose(false); setShowReopen(false); setActionNotes(''); }}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/85 hover:bg-slate-50 dark:hover:bg-white/5">Cancel</button>
              <button onClick={() => handleAction(showResolve ? 'resolve' : showClose ? 'close' : 'reopen')} disabled={actionLoading}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md text-white shadow-sm disabled:opacity-50 flex items-center gap-1.5 ${
                  showResolve ? 'bg-emerald-600 hover:bg-emerald-700' : showClose ? 'bg-slate-500 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-700'
                }`}>
                {actionLoading && <Loader2 size={11} className="animate-spin" />}
                {showResolve ? 'Done' : showClose ? 'Close' : 'Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail Panel Row ─────────────────────────────────────────────────────────

function DetailRow({ label, icon, children }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-white/55 flex-shrink-0 w-20">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex-1 flex justify-end min-w-0">{children}</div>
    </div>
  );
}
