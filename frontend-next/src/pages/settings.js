import React, { useState, useEffect } from 'react';
import { departmentsAPI, positionsAPI, leavesAPI } from '@/services/api';
import Modal from '@/components/common/Modal';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Plus, Edit, Trash2, Building2, Briefcase, Calendar } from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

const TABS = [
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'positions', label: 'Positions', icon: Briefcase },
  { id: 'leave_types', label: 'Leave Types', icon: Calendar },
];

function SettingsContent() {
  const [tab, setTab] = useState('departments');
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const loadAll = () => {
    departmentsAPI.list().then(r => setDepartments(r.data)).catch(console.error);
    positionsAPI.list().then(r => setPositions(r.data)).catch(console.error);
    leavesAPI.types().then(r => setLeaveTypes(r.data)).catch(console.error);
  };

  useEffect(() => { loadAll(); }, []);

  const openAdd = () => { setEditItem(null); setForm({}); setModal(tab); };
  const openEdit = (item) => { setEditItem(item); setForm({ ...item }); setModal(tab); };

  const handleSaveDept = async () => {
    if (!form.name || !form.code) { alert('Name and code required'); return; }
    setSaving(true);
    try {
      if (editItem) await departmentsAPI.update(editItem.id, form);
      else await departmentsAPI.create(form);
      setModal(null); loadAll();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleSavePosition = async () => {
    if (!form.title || !form.code) { alert('Title and code required'); return; }
    setSaving(true);
    try {
      if (editItem) await positionsAPI.update(editItem.id, form);
      else await positionsAPI.create(form);
      setModal(null); loadAll();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleSaveLeaveType = async () => {
    if (!form.name || !form.code) { alert('Name and code required'); return; }
    setSaving(true);
    try {
      if (editItem) await leavesAPI.updateType(editItem.id, form);
      else await leavesAPI.createType(form);
      setModal(null); loadAll();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = (type, id, name) => {
    setConfirm({
      title: 'Deactivate Item',
      message: `Are you sure you want to deactivate "${name}"?`,
      confirmLabel: 'Deactivate',
      variant: 'warning',
      onConfirm: async () => {
        setConfirming(true);
        try {
          if (type === 'departments') await departmentsAPI.delete(id);
          else if (type === 'positions') await positionsAPI.delete(id);
          loadAll();
        } finally { setConfirming(false); setConfirm(null); }
      },
    });
  };

  const F = ({ label, name, type = 'text', required }) => (
    <div>
      <label className="label">{label}{required && ' *'}</label>
      <input type={type} className="input" value={form[name] || ''} onChange={e => setForm({ ...form, [name]: e.target.value })} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <div className="flex gap-1 bg-oe-surface rounded-xl p-1 w-max sm:w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-oe-card text-oe-text shadow' : 'text-oe-muted hover:text-oe-text'}`}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'departments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openAdd} className="btn-primary"><Plus size={15} /> Add Department</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map(d => (
              <div key={d.id} className="card hover:border-oe-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-oe-text">{d.name}</div>
                    <div className="text-xs text-oe-muted">{d.code} · {d.location || 'No location'}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => openEdit(d)} data-tip="Edit department" className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-primary transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"><Edit size={13} /></button>
                    <button onClick={() => handleDelete('departments', d.id, d.name)} data-tip="Delete department" className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-danger transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="text-xs text-oe-muted">{d.description || 'No description'}</div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-oe-border/50">
                  <span className="text-xs text-oe-muted">Head: {d.head_name || 'Unassigned'}</span>
                  <span className="text-xs font-medium text-oe-text">{d.active_count || d.headcount || 0} employees</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'positions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openAdd} className="btn-primary"><Plus size={15} /> Add Position</button>
          </div>
          <div className="card p-0 overflow-hidden hidden md:block">
            <table className="w-full">
              <thead className="bg-oe-surface/50">
                <tr>{['Title', 'Code', 'Department', 'Level', 'Grade', 'Salary Range', 'Headcount', 'Actions'].map(h => <th key={h} className="table-header">{h}</th>)}</tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.id} className="table-row">
                    <td className="table-cell font-medium text-oe-text">{p.title}</td>
                    <td className="table-cell text-xs text-oe-muted">{p.code}</td>
                    <td className="table-cell text-xs text-oe-muted">{p.department_name || '-'}</td>
                    <td className="table-cell text-center">{p.level}</td>
                    <td className="table-cell"><span className="px-2 py-0.5 bg-oe-surface rounded text-xs text-oe-muted">{p.grade || '-'}</span></td>
                    <td className="table-cell text-xs text-oe-muted">
                      {p.min_salary && p.max_salary ? `$${(p.min_salary/1000).toFixed(0)}k – $${(p.max_salary/1000).toFixed(0)}k` : '-'}
                    </td>
                    <td className="table-cell text-center">{p.headcount || 0}</td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} data-tip="Edit position" className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-primary transition-colors"><Edit size={13} /></button>
                        <button onClick={() => handleDelete('positions', p.id, p.title)} data-tip="Delete position" className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-danger transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3">
            {positions.map(p => (
              <div key={p.id} className="bg-white dark:bg-oe-card border border-oe-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-oe-text text-sm">{p.title}</div>
                    <div className="text-xs text-oe-muted">{p.code} · {p.department_name || 'No dept'}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => openEdit(p)} data-tip="Edit position" className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-primary transition-colors"><Edit size={13} /></button>
                    <button onClick={() => handleDelete('positions', p.id)} data-tip="Delete position" className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-danger transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'leave_types' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openAdd} className="btn-primary"><Plus size={15} /> Add Leave Type</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leaveTypes.map(lt => (
              <div key={lt.id} className="card hover:border-oe-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: lt.color }} />
                    <div className="font-semibold text-oe-text truncate">{lt.name}</div>
                  </div>
                  <button onClick={() => openEdit(lt)} data-tip="Edit leave type" className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-primary transition-colors flex-shrink-0 ml-2 min-h-[36px] min-w-[36px] flex items-center justify-center"><Edit size={13} /></button>
                </div>
                <div className="text-xs text-oe-muted mb-3">{lt.code} · {lt.description || 'No description'}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full border ${lt.is_paid ? 'border-oe-success/30 text-oe-success bg-oe-success/10' : 'border-oe-muted/30 text-oe-muted'}`}>{lt.is_paid ? 'Paid' : 'Unpaid'}</span>
                  <span className="px-2 py-0.5 rounded-full bg-oe-surface text-oe-muted">{lt.days_allowed} days/year</span>
                  {lt.carry_forward && <span className="px-2 py-0.5 rounded-full bg-oe-primary/10 text-oe-primary border border-oe-primary/20">Carry Forward</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={modal === 'departments'} onClose={() => setModal(null)} title={editItem ? 'Edit Department' : 'Add Department'} size="sm">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F label="Department Name" name="name" required />
            <F label="Code" name="code" required />
          </div>
          <F label="Description" name="description" />
          <F label="Location" name="location" />
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setModal(null)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSaveDept} disabled={saving} className="btn-primary justify-center">{saving ? 'Saving...' : editItem ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'positions'} onClose={() => setModal(null)} title={editItem ? 'Edit Position' : 'Add Position'} size="sm">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F label="Title" name="title" required />
            <F label="Code" name="code" required />
            <div>
              <label className="label">Department</label>
              <select className="input" value={form.department_id || ''} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Select...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <F label="Grade" name="grade" />
            <F label="Level (1-10)" name="level" type="number" />
            <div />
            <F label="Min Salary" name="min_salary" type="number" />
            <F label="Max Salary" name="max_salary" type="number" />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setModal(null)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSavePosition} disabled={saving} className="btn-primary justify-center">{saving ? 'Saving...' : editItem ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'leave_types'} onClose={() => setModal(null)} title={editItem ? 'Edit Leave Type' : 'Add Leave Type'} size="sm">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F label="Name" name="name" required />
            <F label="Code" name="code" required />
            <F label="Days Allowed" name="days_allowed" type="number" />
            <div>
              <label className="label">Color</label>
              <input type="color" className="input h-10" value={form.color || '#3B82F6'} onChange={e => setForm({ ...form, color: e.target.value })} />
            </div>
          </div>
          <F label="Description" name="description" />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-oe-muted cursor-pointer min-h-[44px]">
              <input type="checkbox" checked={form.is_paid !== false} onChange={e => setForm({ ...form, is_paid: e.target.checked })} />
              Paid Leave
            </label>
            <label className="flex items-center gap-2 text-sm text-oe-muted cursor-pointer min-h-[44px]">
              <input type="checkbox" checked={!!form.carry_forward} onChange={e => setForm({ ...form, carry_forward: e.target.checked })} />
              Carry Forward
            </label>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setModal(null)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSaveLeaveType} disabled={saving} className="btn-primary justify-center">{saving ? 'Saving...' : editItem ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant}
        loading={confirming}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PrivateRoute>
      <Layout>
        <SettingsContent />
      </Layout>
    </PrivateRoute>
  );
}
