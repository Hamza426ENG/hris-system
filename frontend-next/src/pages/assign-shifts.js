import React, { useState, useEffect } from 'react';
import { workShiftsAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import {
  UserCog, Search, X, Timer, Clock, Users, Building, Briefcase, CheckCircle, AlertTriangle
} from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';
import Avatar from '@/components/common/Avatar';

function fmtTime12(time24) {
  if (!time24) return '—';
  const [h, m] = time24.split(':');
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const hr12 = hr % 12 || 12;
  return `${hr12}:${m} ${ampm}`;
}

function AssignShiftsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const canAccess = ['super_admin', 'hr_admin', 'manager'].includes(user?.role);

  const [team, setTeam] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterShift, setFilterShift] = useState('all'); // 'all' | 'unassigned' | shift_id
  const [savingId, setSavingId] = useState(null);
  const [successId, setSuccessId] = useState(null);

  useEffect(() => {
    if (!user) return; // wait for auth to load
    if (!canAccess) { router.replace('/'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [teamRes, shiftsRes] = await Promise.all([
        workShiftsAPI.team(),
        workShiftsAPI.list({ status: true }),
      ]);
      setTeam(teamRes.data || []);
      setShifts(shiftsRes.data || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (employeeId, shiftId) => {
    setSavingId(employeeId);
    setSuccessId(null);
    try {
      await workShiftsAPI.assign(employeeId, { shift_id: shiftId || null });
      setTeam(prev => prev.map(e => {
        if (e.id !== employeeId) return e;
        const shift = shifts.find(s => s.id === shiftId);
        return {
          ...e,
          shift_id: shiftId || null,
          shift_name: shift?.shift_name || null,
          shift_start_time: shift?.start_time || null,
          shift_end_time: shift?.end_time || null,
          shift_timezone: shift?.timezone || null,
        };
      }));
      setSuccessId(employeeId);
      setTimeout(() => setSuccessId(null), 2000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign shift');
    } finally {
      setSavingId(null);
    }
  };

  const filtered = team.filter(e => {
    const matchSearch = `${e.first_name} ${e.last_name} ${e.emp_code || ''} ${e.department_name || ''} ${e.position_title || ''}`
      .toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterShift === 'all') return true;
    if (filterShift === 'unassigned') return !e.shift_id;
    return e.shift_id === filterShift;
  });

  const assignedCount = team.filter(e => e.shift_id).length;
  const unassignedCount = team.length - assignedCount;

  if (!canAccess) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-oe-text flex items-center gap-2">
            <UserCog size={22} className="text-oe-primary" /> Assign Shifts
          </h1>
          <p className="text-sm text-oe-muted mt-0.5">
            {user?.role === 'manager' ? 'Assign work shifts to your direct reports' : 'Assign work shifts to employees'}
          </p>
        </div>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card py-3 px-4 text-center">
            <div className="text-lg font-bold text-oe-text">{team.length}</div>
            <div className="text-[11px] text-oe-muted uppercase tracking-wide">Total</div>
          </div>
          <div className="card py-3 px-4 text-center">
            <div className="text-lg font-bold text-oe-success">{assignedCount}</div>
            <div className="text-[11px] text-oe-muted uppercase tracking-wide">Shift Assigned</div>
          </div>
          <div className="card py-3 px-4 text-center">
            <div className="text-lg font-bold text-oe-warning">{unassignedCount}</div>
            <div className="text-[11px] text-oe-muted uppercase tracking-wide">No Shift</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
          <input
            className="input pl-9 pr-8"
            placeholder="Search by name, ID, department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-oe-muted hover:text-oe-text">
              <X size={14} />
            </button>
          )}
        </div>
        <select
          className="input w-auto min-w-[180px]"
          value={filterShift}
          onChange={e => setFilterShift(e.target.value)}
        >
          <option value="all">All Employees</option>
          <option value="unassigned">No Shift Assigned</option>
          {shifts.map(s => (
            <option key={s.id} value={s.id}>{s.shift_name}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : team.length === 0 ? (
        <div className="card text-center py-12">
          <Users size={36} className="text-oe-muted mx-auto mb-3" />
          <p className="text-oe-muted text-sm">
            {user?.role === 'manager'
              ? 'No direct reports found. Employees must have you set as their manager.'
              : 'No active employees found.'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10">
          <Search size={28} className="text-oe-muted mx-auto mb-2" />
          <p className="text-oe-muted text-sm">No employees match your filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="card p-0 overflow-hidden hidden md:block">
            <table className="w-full">
              <thead className="bg-oe-surface/50">
                <tr>
                  {['Employee', 'Department', 'Position', 'Current Shift', 'Assign Shift', ''].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => (
                  <tr key={emp.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={emp.avatar_url} firstName={emp.first_name} lastName={emp.last_name} size={32} className="w-8 h-8 rounded-full flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-oe-text text-sm truncate">{emp.first_name} {emp.last_name}</div>
                          {emp.emp_code && <div className="text-[11px] text-oe-muted">{emp.emp_code}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-xs text-oe-muted">{emp.department_name || '—'}</td>
                    <td className="table-cell text-xs text-oe-muted">{emp.position_title || '—'}</td>
                    <td className="table-cell">
                      {emp.shift_name ? (
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-oe-success flex-shrink-0" />
                          <span className="text-xs text-oe-text font-medium">{emp.shift_name}</span>
                          <span className="text-[11px] text-oe-muted">({fmtTime12(emp.shift_start_time)} - {fmtTime12(emp.shift_end_time)})</span>
                        </div>
                      ) : (
                        <span className="text-xs text-oe-muted/50">Not assigned</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <select
                        className="text-xs border border-oe-border/60 rounded-md px-2 py-1.5 bg-transparent text-oe-text focus:outline-none focus:border-oe-primary transition-colors w-full max-w-[200px]"
                        value={emp.shift_id || ''}
                        disabled={savingId === emp.id}
                        onChange={e => handleAssign(emp.id, e.target.value)}
                      >
                        <option value="">No shift</option>
                        {shifts.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.shift_name} ({s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="table-cell w-8">
                      {savingId === emp.id && (
                        <div className="w-4 h-4 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
                      )}
                      {successId === emp.id && (
                        <CheckCircle size={16} className="text-oe-success" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(emp => (
              <div key={emp.id} className="card">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar src={emp.avatar_url} firstName={emp.first_name} lastName={emp.last_name} size={36} className="w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-oe-text truncate">{emp.first_name} {emp.last_name}</div>
                    <div className="text-[11px] text-oe-muted truncate">
                      {emp.position_title || '—'}{emp.department_name ? ` · ${emp.department_name}` : ''}
                    </div>
                  </div>
                  {savingId === emp.id && (
                    <div className="w-4 h-4 border-2 border-oe-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                  {successId === emp.id && (
                    <CheckCircle size={16} className="text-oe-success flex-shrink-0" />
                  )}
                </div>

                {emp.shift_name && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs">
                    <Clock size={11} className="text-oe-success" />
                    <span className="text-oe-text font-medium">{emp.shift_name}</span>
                    <span className="text-oe-muted">({fmtTime12(emp.shift_start_time)} - {fmtTime12(emp.shift_end_time)})</span>
                  </div>
                )}

                <select
                  className="w-full text-xs border border-oe-border/60 rounded-md px-2 py-2 bg-transparent text-oe-text focus:outline-none focus:border-oe-primary transition-colors"
                  value={emp.shift_id || ''}
                  disabled={savingId === emp.id}
                  onChange={e => handleAssign(emp.id, e.target.value)}
                >
                  <option value="">No shift assigned</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.shift_name} ({s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Info note */}
      {!loading && shifts.length === 0 && team.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/40">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            No work shifts have been created yet. Ask your HR administrator to create shifts in the <strong>Work Shifts</strong> module.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AssignShiftsPage() {
  return (
    <PrivateRoute>
      <Layout>
        <AssignShiftsContent />
      </Layout>
    </PrivateRoute>
  );
}
