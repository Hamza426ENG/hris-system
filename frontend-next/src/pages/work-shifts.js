import React, { useState, useEffect } from 'react';
import { workShiftsAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import {
  Timer, Plus, Edit, Trash2, Clock, Globe, CheckCircle,
  XCircle, AlertTriangle, Search, X
} from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';
import Modal from '@/components/common/Modal';

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const EMPTY_FORM = {
  shift_name: '',
  start_time: '',
  end_time: '',
  timezone: 'Asia/Karachi',
  description: '',
  is_active: true,
};

function fmtTime12(time24) {
  if (!time24) return '—';
  const [h, m] = time24.split(':');
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const hr12 = hr % 12 || 12;
  return `${hr12}:${m} ${ampm}`;
}

function WorkShiftsContent() {
  const { user } = useAuth();
  const canEdit = ['super_admin', 'hr_admin'].includes(user?.role);

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const res = await workShiftsAPI.list();
      setShifts(res.data || []);
    } catch (err) {
      console.error('Failed to load shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadShifts(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (shift) => {
    setEditingId(shift.id);
    setForm({
      shift_name: shift.shift_name || '',
      start_time: shift.start_time?.slice(0, 5) || '',
      end_time: shift.end_time?.slice(0, 5) || '',
      timezone: shift.timezone || 'UTC',
      description: shift.description || '',
      is_active: shift.is_active !== false,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.shift_name.trim()) { alert('Shift name is required'); return; }
    if (!form.start_time) { alert('Start time is required'); return; }
    if (!form.end_time) { alert('End time is required'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await workShiftsAPI.update(editingId, form);
      } else {
        await workShiftsAPI.create(form);
      }
      setModalOpen(false);
      loadShifts();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save shift');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await workShiftsAPI.delete(deleteId);
      setDeleteId(null);
      loadShifts();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete shift');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = shifts.filter(s =>
    s.shift_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.timezone || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-oe-text flex items-center gap-2">
            <Timer size={22} className="text-oe-primary" /> Work Shifts
          </h1>
          <p className="text-sm text-oe-muted mt-0.5">Define and manage employee shift timings</p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn-primary">
            <Plus size={15} /> Add Shift
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
        <input
          className="input pl-9 pr-8"
          placeholder="Search shifts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-oe-muted hover:text-oe-text">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Timer size={36} className="text-oe-muted mx-auto mb-3" />
          <p className="text-oe-muted text-sm">
            {search ? 'No shifts match your search.' : 'No work shifts defined yet.'}
          </p>
          {canEdit && !search && (
            <button onClick={openCreate} className="btn-primary mt-4 text-sm">
              <Plus size={14} /> Create First Shift
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="card p-0 overflow-hidden hidden md:block">
            <table className="w-full">
              <thead className="bg-oe-surface/50">
                <tr>
                  {['Shift Name', 'Start Time', 'End Time', 'Timezone', 'Description', 'Status', ...(canEdit ? ['Actions'] : [])].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(shift => (
                  <tr key={shift.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${shift.is_active ? 'bg-oe-success' : 'bg-oe-muted/40'}`} />
                        <span className="font-medium text-oe-text">{shift.shift_name}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock size={12} className="text-oe-success" />
                        {fmtTime12(shift.start_time)}
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock size={12} className="text-oe-danger" />
                        {fmtTime12(shift.end_time)}
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-oe-muted">
                        <Globe size={12} />
                        {shift.timezone}
                      </div>
                    </td>
                    <td className="table-cell text-xs text-oe-muted max-w-48">
                      <span className="line-clamp-2">{shift.description || '—'}</span>
                    </td>
                    <td className="table-cell">
                      <span className={shift.is_active ? 'badge-active' : 'badge-inactive'}>
                        {shift.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(shift)}
                            className="p-1.5 rounded hover:bg-oe-primary/10 text-oe-muted hover:text-oe-primary transition-colors"
                            title="Edit Shift"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteId(shift.id)}
                            className="p-1.5 rounded hover:bg-oe-danger/10 text-oe-muted hover:text-oe-danger transition-colors"
                            title="Delete Shift"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(shift => (
              <div key={shift.id} className="card">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${shift.is_active ? 'bg-oe-success' : 'bg-oe-muted/40'}`} />
                    <span className="font-semibold text-oe-text">{shift.shift_name}</span>
                  </div>
                  <span className={shift.is_active ? 'badge-active' : 'badge-inactive'}>
                    {shift.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                  <div>
                    <div className="text-[11px] text-oe-muted uppercase tracking-wide">Start</div>
                    <div className="flex items-center gap-1 text-oe-text font-medium">
                      <Clock size={12} className="text-oe-success" /> {fmtTime12(shift.start_time)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-oe-muted uppercase tracking-wide">End</div>
                    <div className="flex items-center gap-1 text-oe-text font-medium">
                      <Clock size={12} className="text-oe-danger" /> {fmtTime12(shift.end_time)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-oe-muted mb-2">
                  <Globe size={11} /> {shift.timezone}
                </div>
                {shift.description && (
                  <p className="text-xs text-oe-muted border-t border-oe-border/30 pt-2 mt-2">{shift.description}</p>
                )}
                {canEdit && (
                  <div className="flex gap-2 pt-2 border-t border-oe-border/30 mt-2">
                    <button onClick={() => openEdit(shift)} className="btn-secondary text-xs py-1.5 px-3">
                      <Edit size={11} /> Edit
                    </button>
                    <button onClick={() => setDeleteId(shift.id)} className="text-xs text-oe-danger hover:underline py-1.5 px-2">
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Work Shift' : 'Create Work Shift'}
        size="md"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Shift Name *</label>
            <input
              className="input"
              placeholder="e.g. Morning Shift, Night Shift"
              value={form.shift_name}
              onChange={e => setForm({ ...form, shift_name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Start Time *</label>
              <input
                type="time"
                className="input"
                value={form.start_time}
                onChange={e => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div>
              <label className="label">End Time *</label>
              <input
                type="time"
                className="input"
                value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Timezone *</label>
            <select
              className="input"
              value={form.timezone}
              onChange={e => setForm({ ...form, timezone: e.target.value })}
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Description <span className="text-oe-muted font-normal">(optional)</span></label>
            <textarea
              className="input"
              rows={2}
              placeholder="Brief description of this shift..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
              />
              <div className="w-9 h-5 bg-oe-border rounded-full peer peer-checked:bg-oe-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
            </label>
            <span className="text-sm text-oe-text">{form.is_active ? 'Active' : 'Inactive'}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 p-5 pt-3 border-t border-oe-border">
          <button onClick={() => setModalOpen(false)} className="btn-secondary justify-center">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary justify-center gap-1.5 min-w-[140px]">
            {saving
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
              : <><CheckCircle size={13} /> {editingId ? 'Update Shift' : 'Create Shift'}</>
            }
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Work Shift"
        size="sm"
      >
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-oe-danger/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} className="text-oe-danger" />
            </div>
            <div>
              <p className="text-sm text-oe-text font-medium">Are you sure you want to delete this shift?</p>
              <p className="text-xs text-oe-muted mt-1">This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-oe-danger text-white text-sm font-medium hover:bg-oe-danger/90 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function WorkShiftsPage() {
  return (
    <PrivateRoute>
      <Layout>
        <WorkShiftsContent />
      </Layout>
    </PrivateRoute>
  );
}
