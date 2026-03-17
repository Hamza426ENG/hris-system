import React, { useState, useEffect } from 'react';
import { departmentsAPI, positionsAPI, leavesAPI, employeesAPI } from '../services/api';
import Modal from '../components/Modal';
import { Plus, Edit, Trash2, Building2, Briefcase, Calendar, UserCheck } from 'lucide-react';

const TABS = [
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'positions', label: 'Positions', icon: Briefcase },
  { id: 'leave_types', label: 'Leave Types', icon: Calendar },
];

export default function Settings() {
  const [tab, setTab] = useState('departments');
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [deptEmployees, setDeptEmployees] = useState([]);
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const loadAll = () => {
    departmentsAPI.list().then(r => setDepartments(r.data)).catch(console.error);
    positionsAPI.list().then(r => setPositions(r.data)).catch(console.error);
    leavesAPI.types().then(r => setLeaveTypes(r.data)).catch(console.error);
    employeesAPI.list({ status: 'active', limit: 200 }).then(r => setAllEmployees(r.data.data || [])).catch(console.error);
  };

  useEffect(() => { loadAll(); }, []);

  // When dept modal opens, load employees in that department
  const openAdd = () => {
    setEditItem(null);
    setForm({});
    setDeptEmployees([]);
    setModal(tab);
  };

  const openEdit = async (item) => {
    setEditItem(item);
    setForm({ ...item });
    setModal(tab);
    if (tab === 'departments') {
      try {
        const res = await employeesAPI.list({ department: item.id, status: 'active', limit: 200 });
        setDeptEmployees(res.data.data || []);
      } catch { setDeptEmployees([]); }
    }
  };

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

  const handleDelete = async (type, id) => {
    if (!window.confirm('Deactivate this item?')) return;
    if (type === 'departments') await departmentsAPI.delete(id);
    else if (type === 'positions') await positionsAPI.delete(id);
    loadAll();
  };

  const F = ({ label, name, type = 'text', required }) => (
    <div>
      <label className="label">{label}{required && ' *'}</label>
      <input type={type} className="input" value={form[name] || ''} onChange={e => setForm({ ...form, [name]: e.target.value })} />
    </div>
  );

  // Employees list for dept head dropdown:
  // If editing: dept employees first, then remaining active employees
  const headOptions = editItem
    ? [
        ...deptEmployees,
        ...allEmployees.filter(e => !deptEmployees.find(d => d.id === e.id)),
      ]
    : allEmployees;

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <div className="flex gap-1 bg-oe-surface rounded-xl p-1 w-max sm:w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-oe-card text-oe-text shadow' : 'text-oe-muted hover:text-oe-text'}`}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Departments */}
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
                    <button onClick={() => openEdit(d)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-primary transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"><Edit size={13} /></button>
                    <button onClick={() => handleDelete('departments', d.id)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-danger transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="text-xs text-oe-muted">{d.description || 'No description'}</div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-oe-border/50">
                  <div className="flex items-center gap-1.5">
                    <UserCheck size={12} className={d.head_name ? 'text-oe-success' : 'text-oe-muted'} />
                    <span className="text-xs text-oe-muted truncate max-w-[120px]">{d.head_name || 'No head assigned'}</span>
                  </div>
                  <span className="text-xs font-medium text-oe-text">{d.active_count || 0} employees</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Positions */}
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
                        <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-primary transition-colors"><Edit size={13} /></button>
                        <button onClick={() => handleDelete('positions', p.id)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-danger transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3">
            {positions.map(p => (
              <div key={p.id} className="bg-white border border-oe-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-oe-text text-sm">{p.title}</div>
                    <div className="text-xs text-oe-muted">{p.code} · {p.department_name || 'No dept'}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-primary transition-colors"><Edit size={13} /></button>
                    <button onClick={() => handleDelete('positions', p.id)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-danger transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {p.grade && <span className="px-1.5 py-0.5 bg-oe-surface rounded text-oe-muted">Grade: {p.grade}</span>}
                  {p.level && <span className="px-1.5 py-0.5 bg-oe-surface rounded text-oe-muted">Level: {p.level}</span>}
                  <span className="px-1.5 py-0.5 bg-oe-surface rounded text-oe-muted">{p.headcount || 0} staff</span>
                  {p.min_salary && p.max_salary && (
                    <span className="px-1.5 py-0.5 bg-oe-surface rounded text-oe-muted">${(p.min_salary/1000).toFixed(0)}k–${(p.max_salary/1000).toFixed(0)}k</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leave Types */}
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
                  <button onClick={() => openEdit(lt)} className="p-1.5 hover:bg-oe-surface rounded text-oe-muted hover:text-oe-primary transition-colors flex-shrink-0 ml-2 min-h-[36px] min-w-[36px] flex items-center justify-center"><Edit size={13} /></button>
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

      {/* Department Modal */}
      <Modal open={modal === 'departments'} onClose={() => setModal(null)} title={editItem ? 'Edit Department' : 'Add Department'} size="sm">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F label="Department Name" name="name" required />
            <F label="Code" name="code" required />
          </div>
          <F label="Description" name="description" />
          <F label="Location" name="location" />

          {/* Head of Department */}
          <div>
            <label className="label flex items-center gap-1.5">
              <UserCheck size={13} className="text-oe-purple" />
              Head of Department
            </label>
            <select
              className="input"
              value={form.head_employee_id || ''}
              onChange={e => setForm({ ...form, head_employee_id: e.target.value || null })}
            >
              <option value="">— Not assigned —</option>
              {editItem && deptEmployees.length > 0 && (
                <optgroup label={`${editItem.name} employees`}>
                  {deptEmployees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} · {e.position_title || 'No position'}
                    </option>
                  ))}
                </optgroup>
              )}
              {headOptions.filter(e => !deptEmployees.find(d => d.id === e.id)).length > 0 && (
                <optgroup label="Other employees">
                  {headOptions.filter(e => !deptEmployees.find(d => d.id === e.id)).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} · {e.position_title || e.department_name || 'No position'}
                    </option>
                  ))}
                </optgroup>
              )}
              {!editItem && headOptions.map(e => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} · {e.position_title || 'No position'}
                </option>
              ))}
            </select>
            {editItem && deptEmployees.length === 0 && (
              <p className="text-xs text-oe-muted mt-1">No active employees in this department yet.</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setModal(null)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSaveDept} disabled={saving} className="btn-primary justify-center">{saving ? 'Saving...' : editItem ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </Modal>

      {/* Position Modal */}
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

      {/* Leave Type Modal */}
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
    </div>
  );
}
