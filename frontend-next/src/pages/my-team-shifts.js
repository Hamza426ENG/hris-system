import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { workShiftsAPI } from '@/services/api';
import { Timer, Search, Users, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

const fmtTime12 = (t) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
};

function MyTeamShiftsContent() {
  const { user } = useAuth();
  const [team, setTeam]           = useState([]);
  const [shifts, setShifts]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [savingId, setSavingId]   = useState(null);
  const [savedId, setSavedId]     = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, shiftsRes] = await Promise.all([
        workShiftsAPI.team(),
        workShiftsAPI.list({ status: true }),
      ]);
      setTeam(teamRes.data || []);
      setShifts(shiftsRes.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAssign = async (employeeId, shiftId) => {
    setSavingId(employeeId);
    try {
      await workShiftsAPI.assign(employeeId, { shift_id: shiftId || null });
      // Update local state
      setTeam(prev => prev.map(e =>
        e.id === employeeId
          ? {
              ...e,
              shift_id: shiftId || null,
              shift_name: shifts.find(s => s.id === shiftId)?.shift_name || null,
              shift_start_time: shifts.find(s => s.id === shiftId)?.start_time || null,
              shift_end_time: shifts.find(s => s.id === shiftId)?.end_time || null,
            }
          : e
      ));
      setSavedId(employeeId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign shift');
    } finally { setSavingId(null); }
  };

  const filtered = team.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q)
      || (e.emp_code || '').toLowerCase().includes(q)
      || (e.department_name || '').toLowerCase().includes(q);
  });

  const assigned = team.filter(e => e.shift_id).length;
  const unassigned = team.length - assigned;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (team.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-oe-muted">
        <Users size={36} className="mb-3 opacity-30" />
        <p className="text-sm font-medium">No team members found</p>
        <p className="text-xs mt-1">You don't have any employees reporting to you.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
          <Timer size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-oe-text">My Team Shifts</h1>
          <p className="text-xs text-oe-muted">Assign and manage shift timings for your team members</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 border border-oe-primary/20">
          <div className="text-xl font-bold text-oe-primary">{team.length}</div>
          <div className="text-[11px] text-oe-muted font-medium">Team Members</div>
        </div>
        <div className="card p-4 border border-oe-success/20">
          <div className="text-xl font-bold text-oe-success">{assigned}</div>
          <div className="text-[11px] text-oe-muted font-medium">Shift Assigned</div>
        </div>
        <div className="card p-4 border border-oe-warning/20">
          <div className="text-xl font-bold text-oe-warning">{unassigned}</div>
          <div className="text-[11px] text-oe-muted font-medium">No Shift</div>
        </div>
      </div>

      {shifts.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>No shifts have been created yet. Contact HR/Admin to create shift timings first.</span>
        </div>
      )}

      {/* Search */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-oe-border/50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-oe-bg border border-oe-border max-w-sm">
            <Search size={14} className="text-oe-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, ID, department..."
              className="bg-transparent text-sm text-oe-text outline-none flex-1"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-oe-surface/80">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-oe-muted uppercase tracking-wide">Employee</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-oe-muted uppercase tracking-wide">Department</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-oe-muted uppercase tracking-wide">Current Shift</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-oe-muted uppercase tracking-wide w-64">Assign Shift</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-oe-muted text-sm">No matching employees</td>
                </tr>
              ) : (
                filtered.map(e => (
                  <tr key={e.id} className="border-b border-oe-border/30 hover:bg-oe-bg/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-oe-surface flex items-center justify-center text-xs font-semibold text-oe-muted border border-oe-border/50 flex-shrink-0">
                          {e.first_name?.[0]}{e.last_name?.[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-oe-text truncate">{e.first_name} {e.last_name}</div>
                          <div className="text-[11px] text-oe-muted">{e.emp_code || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-oe-muted">{e.department_name || '—'}</td>
                    <td className="px-4 py-3">
                      {e.shift_name ? (
                        <div>
                          <span className="text-oe-text font-medium">{e.shift_name}</span>
                          <div className="text-[11px] text-oe-muted">
                            {fmtTime12(e.shift_start_time)} – {fmtTime12(e.shift_end_time)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-oe-muted/50">Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          className="flex-1 text-sm bg-transparent border border-oe-border/50 rounded-lg px-2.5 py-1.5 text-oe-text focus:outline-none focus:border-oe-primary transition-colors"
                          value={e.shift_id || ''}
                          disabled={savingId === e.id}
                          onChange={ev => handleAssign(e.id, ev.target.value)}
                        >
                          <option value="">No shift</option>
                          {shifts.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.shift_name} ({s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)})
                            </option>
                          ))}
                        </select>
                        {savingId === e.id && (
                          <div className="w-4 h-4 border-2 border-oe-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        )}
                        {savedId === e.id && (
                          <CheckCircle2 size={16} className="text-oe-success flex-shrink-0" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function MyTeamShiftsPage() {
  return (
    <PrivateRoute>
      <Layout>
        <MyTeamShiftsContent />
      </Layout>
    </PrivateRoute>
  );
}
