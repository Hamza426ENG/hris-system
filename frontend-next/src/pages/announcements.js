import React, { useState, useEffect, useCallback } from 'react';
import { announcementsAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Megaphone, Plus, Trash2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PRIORITY_CONFIG = {
  urgent: { Icon: AlertCircle,   label: 'Urgent', cls: 'text-oe-danger',  bg: 'border-l-oe-danger',  badge: 'bg-oe-danger/10 text-oe-danger' },
  high:   { Icon: AlertTriangle, label: 'High',   cls: 'text-oe-warning', bg: 'border-l-oe-warning', badge: 'bg-oe-warning/10 text-oe-warning' },
  normal: { Icon: Info,          label: null,     cls: 'text-oe-muted',   bg: 'border-l-oe-border',  badge: null },
};

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function PostForm({ onCreated, onClose }) {
  const [form, setForm] = useState({ title: '', content: '', priority: 'normal', expires_at: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await announcementsAPI.create({
        title: form.title.trim(),
        content: form.content.trim(),
        priority: form.priority,
        expires_at: form.expires_at || null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post announcement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card mb-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-oe-text text-sm">New Announcement</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-oe-surface text-oe-muted">
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            placeholder="Announcement title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Content</label>
          <textarea
            className="input resize-none"
            rows={4}
            placeholder="Write your announcement here..."
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Expires (optional)</label>
            <input
              type="date"
              className="input"
              value={form.expires_at}
              onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
            />
          </div>
        </div>
        {error && <p className="text-xs text-oe-danger">{error}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Posting...' : 'Post Announcement'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AnnouncementsContent() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const canPost = ['super_admin', 'hr_admin', 'manager'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await announcementsAPI.list();
      setItems(res.data || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    setDeleting(id);
    try {
      await announcementsAPI.delete(id);
      setItems(prev => prev.filter(a => a.id !== id));
    } catch { /* non-fatal */ }
    finally { setDeleting(null); }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center">
            <Megaphone size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-oe-text">Announcements</h1>
            <p className="text-sm text-oe-muted">Company-wide updates and notices</p>
          </div>
        </div>
        {canPost && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Post Announcement
          </button>
        )}
      </div>

      {showForm && <PostForm onCreated={load} onClose={() => setShowForm(false)} />}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Megaphone size={36} className="text-oe-muted/30 mb-3" />
          <p className="text-oe-muted font-medium">No announcements yet</p>
          {canPost && (
            <p className="text-sm text-oe-muted/70 mt-1">Post the first one to keep your team informed.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(a => {
            const p = PRIORITY_CONFIG[a.priority] || PRIORITY_CONFIG.normal;
            return (
              <div key={a.id} className={`card border-l-4 ${p.bg} hover:shadow-md transition-shadow`}>
                <div className="flex items-start gap-3">
                  <p.Icon size={18} className={`mt-0.5 flex-shrink-0 ${p.cls}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-oe-text">{a.title}</h3>
                        {p.badge && (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.badge}`}>
                            {p.label}
                          </span>
                        )}
                      </div>
                      {canPost && (
                        <button
                          onClick={() => handleDelete(a.id)}
                          disabled={deleting === a.id}
                          className="p-1.5 rounded text-oe-muted hover:text-oe-danger hover:bg-oe-surface transition-colors flex-shrink-0"
                          title="Delete announcement"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-oe-muted mt-1.5 leading-relaxed whitespace-pre-wrap">{a.content}</p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-oe-muted">
                      <span>{timeAgo(a.created_at)}</span>
                      {a.posted_by_name && (
                        <>
                          <span className="text-oe-border">·</span>
                          <span>{a.posted_by_name}</span>
                        </>
                      )}
                      {a.expires_at && (
                        <>
                          <span className="text-oe-border">·</span>
                          <span>Expires {new Date(a.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AnnouncementsPage() {
  return (
    <PrivateRoute>
      <Layout>
        <AnnouncementsContent />
      </Layout>
    </PrivateRoute>
  );
}
