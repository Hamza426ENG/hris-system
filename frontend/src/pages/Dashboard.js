import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, employeesAPI } from '../services/api';
import { Users, Calendar, Clock, Building2, TrendingUp, DollarSign, Gift, ChevronRight, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Modal from '../components/Modal';

const COLORS = ['#1D6BE4', '#7C5CFC', '#00D4FF', '#00D4AA', '#F5A623', '#FF4D6D'];

const StatCard = ({ icon: Icon, label, value, sub, color = 'primary', onClick }) => (
  <div className={`stat-card ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        color === 'primary' ? 'bg-oe-primary/10 text-oe-primary' :
        color === 'success' ? 'bg-oe-success/10 text-oe-success' :
        color === 'warning' ? 'bg-oe-warning/10 text-oe-warning' :
        color === 'danger' ? 'bg-oe-danger/10 text-oe-danger' :
        color === 'purple' ? 'bg-oe-purple/10 text-oe-purple' :
        'bg-oe-cyan/10 text-oe-cyan'
      }`}>
        <Icon size={20} />
      </div>
    </div>
    <div className="text-2xl font-bold text-oe-text mb-0.5">{value}</div>
    <div className="text-sm font-medium text-oe-text mb-1">{label}</div>
    {sub && <div className="text-xs text-oe-muted">{sub}</div>}
  </div>
);

const fmtCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deptModal, setDeptModal] = useState(null); // { id, name, code }
  const [deptEmployees, setDeptEmployees] = useState([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    dashboardAPI.stats().then(res => setData(res.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleBarClick = useCallback(async (barData) => {
    if (!barData?.id) return;
    setDeptModal({ id: barData.id, name: barData.name, code: barData.code, count: barData.actual_count });
    setDeptLoading(true);
    try {
      const res = await employeesAPI.list({ department: barData.id, status: 'active' });
      setDeptEmployees(res.data.data || []);
    } catch { setDeptEmployees([]); }
    finally { setDeptLoading(false); }
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { stats, upcomingBirthdays, recentLeaves, recentHires, leaveSummary, deptHeadcount } = data || {};

  const statusBadge = (s) => {
    const map = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', cancelled: 'badge-inactive' };
    return <span className={map[s] || 'badge-inactive'}>{s}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Employees" value={stats?.totalEmployees || 0} sub={`${stats?.activeEmployees || 0} active`} color="primary" onClick={() => navigate('/employees')} />
        <StatCard icon={TrendingUp} label="New Hires" value={stats?.newHires || 0} sub="Last 30 days" color="success" onClick={() => navigate('/employees')} />
        <StatCard icon={Calendar} label="On Leave" value={stats?.onLeave || 0} sub={`${stats?.pendingLeaves || 0} pending requests`} color="warning" onClick={() => navigate('/leaves')} />
        <StatCard icon={DollarSign} label="YTD Payroll" value={fmtCurrency(stats?.ytdPayroll)} sub="Gross this year" color="purple" onClick={() => navigate('/payroll')} />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Departments" value={stats?.departments || 0} sub="Active departments" color="cyan" onClick={() => navigate('/settings')} />
        <StatCard icon={Clock} label="Pending Leaves" value={stats?.pendingLeaves || 0} sub="Awaiting approval" color="warning" onClick={() => navigate('/leaves?status=pending')} />
        <StatCard icon={Users} label="Active Staff" value={stats?.activeEmployees || 0} sub="Currently active" color="success" />
        <StatCard icon={DollarSign} label="Net Payroll YTD" value={fmtCurrency(stats?.ytdNetPayroll)} sub="Net this year" color="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Headcount */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-oe-text">Department Headcount</h3>
              <p className="text-xs text-oe-muted mt-0.5">Click a bar to see employees</p>
            </div>
            <button onClick={() => navigate('/reports')} className="text-xs text-oe-primary hover:underline flex items-center gap-1">
              View Report <ChevronRight size={12} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptHeadcount?.slice(0, 7)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} style={{ cursor: 'pointer' }}>
              <XAxis dataKey="code" tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E3A5F', borderRadius: 8, color: '#E8F0FE' }} cursor={{ fill: 'rgba(29,107,228,0.08)' }} />
              <Bar dataKey="actual_count" fill="#1D6BE4" radius={[4, 4, 0, 0]} name="Employees" onClick={(data) => handleBarClick(data)} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Leave Summary Pie */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-oe-text">Leave Types (YTD)</h3>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={leaveSummary?.filter(l => parseInt(l.approved) > 0)} dataKey="approved" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                {leaveSummary?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E3A5F', borderRadius: 8, color: '#E8F0FE' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {leaveSummary?.slice(0, 4).map((l, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-oe-muted">{l.name}</span>
                </div>
                <span className="text-oe-text font-medium">{l.approved} approved</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leaves */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-oe-text">Recent Leave Requests</h3>
            <button onClick={() => navigate('/leaves')} className="text-xs text-oe-primary hover:underline flex items-center gap-1">
              View All <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {recentLeaves?.slice(0, 5).map(l => (
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-oe-border/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                    {l.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-oe-text">{l.employee_name}</div>
                    <div className="text-xs text-oe-muted">{l.leave_type_name} · {l.total_days}d</div>
                  </div>
                </div>
                {statusBadge(l.status)}
              </div>
            ))}
            {!recentLeaves?.length && <div className="text-oe-muted text-sm text-center py-4">No leave requests</div>}
          </div>
        </div>

        {/* Recent Hires + Birthdays */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-oe-text">Recent Hires</h3>
              <button onClick={() => navigate('/employees')} className="text-xs text-oe-primary hover:underline flex items-center gap-1">
                View All <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {recentHires?.slice(0, 4).map(e => (
                <div key={e.id} className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-oe-surface rounded-lg px-2 -mx-2 transition-colors" onClick={() => navigate(`/employees/${e.id}`)}>
                  <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                    {`${e.first_name?.[0] || ''}${e.last_name?.[0] || ''}`.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-oe-text truncate">{e.first_name} {e.last_name}</div>
                    <div className="text-xs text-oe-muted truncate">{e.position_title} · {e.department_name}</div>
                  </div>
                  <div className="text-xs text-oe-muted">{fmtDate(e.hire_date)}</div>
                </div>
              ))}
            </div>
          </div>

          {upcomingBirthdays?.length > 0 && (
            <div className="card bg-gradient-to-br from-oe-purple/10 to-oe-primary/10 border-oe-purple/20">
              <div className="flex items-center gap-2 mb-3">
                <Gift size={16} className="text-oe-purple" />
                <h3 className="font-semibold text-oe-text text-sm">Upcoming Birthdays</h3>
              </div>
              <div className="space-y-2">
                {upcomingBirthdays.slice(0, 3).map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white">
                      {`${e.first_name?.[0] || ''}`.toUpperCase()}
                    </div>
                    <span className="text-oe-text">{e.first_name} {e.last_name}</span>
                    <span className="text-oe-muted text-xs ml-auto">{fmtDate(e.date_of_birth)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Department employees modal */}
      <Modal open={!!deptModal} onClose={() => setDeptModal(null)} title={deptModal ? `${deptModal.name} — ${deptModal.count} Employees` : ''} size="md">
        <div className="p-0">
          {deptLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : deptEmployees.length === 0 ? (
            <div className="text-center py-12 text-oe-muted text-sm">No active employees in this department</div>
          ) : (
            <div className="divide-y divide-oe-border max-h-[60vh] overflow-y-auto">
              {deptEmployees.map(emp => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-oe-surface cursor-pointer transition-colors"
                  onClick={() => { navigate(`/employees/${emp.id}`); setDeptModal(null); }}
                >
                  <img
                    src={emp.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${emp.first_name} ${emp.last_name}`)}&backgroundColor=1D6BE4,7C5CFC&backgroundType=gradientLinear&fontSize=36&fontWeight=600`}
                    alt={`${emp.first_name} ${emp.last_name}`}
                    className="w-9 h-9 rounded-full object-cover ring-1 ring-oe-border flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-oe-text truncate">{emp.first_name} {emp.last_name}</div>
                    <div className="text-xs text-oe-muted truncate">{emp.position_title || '—'} · {emp.employee_id}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${emp.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                    {emp.status}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="px-5 py-3 border-t border-oe-border bg-oe-surface/40 flex justify-end">
            <button
              onClick={() => { navigate(`/employees?department=${deptModal?.id}`); setDeptModal(null); }}
              className="btn-primary text-sm"
            >
              View All in Employees <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
