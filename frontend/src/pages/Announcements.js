import React, { useState, useEffect } from 'react';
import { announcementsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Megaphone, Plus, Trash2, Users, AlertTriangle, Info, CheckCircle2, Eye, X, ChevronDown } from 'lucide-react';

const PRIORITY_CONFIG = {
  urgent:  { label: 'Urgent',  cls: 'bg-red-100 text-red-700 border-red-200' },
  high:    { label: 'High',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  normal:  { label: 'Normal',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  low:     { label: 'Low',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const ALL_ROLES = [
  { value: 'employee',    label: 'Employee' },
  { value: 'team_lead',   label: 'Team Lead' },
  { value: 'hr_admin',    label: 'HR Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const EMPTY_FORM = {
  title: '', content: '', priority: 'normal', expires_at: '',
  target_roles: ['employee', 'team_lead', 'hr_admin', 'super_admin'],
};

export default function Announcements() {
  const { user } = useAuth();
  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [ackModal, setAckModal] = useState(null); // { id, title }
  const [acks, setAcks] = useState([]);
  const [acksLoading, setAcksLoading] = useState(false);

  const load = () => {
    setLoading(true);
    announcementsAPI.list()
      .then(res => setList(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAcks = async (ann) => {
    setAckModal({ id: ann.id, title: ann.title });
    setAcksLoading(true);
    setAcks([]);
    try {
      const res = await announcementsAPI.acknowledgements(ann.id);
      setAcks(res.data || []);
    } catch { setAcks([]); }
    finally { setAcksLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await announcementsAPI.create({
        ...form,
        expires_at: form.expires_at || null,
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this announcement?')) return;
    await announcementsAPI.delete(id).catch(console.error);
    load();
  };

  const toggleRole = (role) => {
    setForm(f => ({
      ...f,
      target_roles: f.target_roles.includes(role)
        ? f.target_roles.filter(r => r !== role)
        : [...f.target_roles, role],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-oe-text">Announcements</h1>
          <p className="text-sm text-oe-muted mt-0.5">
            {isHR ? 'Manage company-wide announcements' : 'Company announcements'}
          </p>
        </div>
        {isHR && (
          <button onClick={() => { setForm(EMPTY_FORM); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Announcement
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="card text-center py-16">
          <Megaphone size={40} className="mx-auto text-oe-muted mb-3" />
          <p className="text-oe-muted">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(ann => {
            const cfg = PRIORITY_CONFIG[ann.priority] || PRIORITY_CONFIG.normal;
            return (
              <div key={ann.id} className="card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-oe-primary/10 flex items-center justify-center flex-shrink-0">
                      <Megaphone size={18} className="text-oe-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-oe-text">{ann.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-sm text-oe-muted line-clamp-2 mb-2">{ann.content}</p>
                      <div className="flex items-center gap-3 flex-wrap text-xs text-oe-muted">
                        <span>By {ann.posted_by_name || 'Admin'}</span>
                        <span>·</span>
                        <span>{fmtDate(ann.created_at)}</span>
                        {ann.expires_at && (
                          <>
                            <span>·</span>
                            <span>Expires {fmtDate(ann.expires_at)}</span>
                          </>
                        )}
                        {ann.target_roles && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Users size={11} />
                              {ann.target_roles.map(r => r.replace('_', ' ')).join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {isHR && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openAcks(ann)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-oe-primary hover:bg-oe-primary/10 transition-colors font-medium"
                        title="View acknowledgements"
                      >
                        <Eye size={14} />
                        {ann.ack_count || 0} Acks
                      </button>
                      <button
                        onClick={() => handleDelete(ann.id)}
                        className="p-1.5 rounded-lg text-oe-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Deactivate"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-oe-text">New Announcement</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-oe-muted transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-oe-text mb-1.5">Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                  placeholder="Announcement title"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-oe-text mb-1.5">Content *</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  required
                  rows={5}
                  placeholder="Write your announcement here..."
                  className="input w-full resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-oe-text mb-1.5">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="input w-full"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-oe-text mb-1.5">Expires (optional)</label>
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                    className="input w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-oe-text mb-2">Target Roles</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => toggleRole(r.value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        form.target_roles.includes(r.value)
                          ? 'bg-oe-primary text-white border-oe-primary'
                          : 'bg-white text-oe-muted border-slate-200 hover:border-oe-primary'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Megaphone size={15} />}
                  Post Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Acknowledgements Modal */}
      {ackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-oe-text">Acknowledgements</h2>
                <p className="text-xs text-oe-muted mt-0.5 truncate max-w-xs">{ackModal.title}</p>
              </div>
              <button onClick={() => setAckModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-oe-muted">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {acksLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : acks.length === 0 ? (
                <div className="text-center py-12 text-oe-muted text-sm">No acknowledgements yet</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {acks.map(a => (
                    <div key={a.id} className="px-6 py-3 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-oe-primary/10 flex items-center justify-center text-xs font-bold text-oe-primary flex-shrink-0">
                        {(a.employee_name || a.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-oe-text">{a.employee_name || a.email}</div>
                        <div className="text-xs text-oe-muted">{new Date(a.acknowledged_at).toLocaleString()}</div>
                        {a.feedback && (
                          <p className="mt-1 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                            "{a.feedback}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 text-xs text-oe-muted">
              {acks.length} acknowledgement{acks.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
