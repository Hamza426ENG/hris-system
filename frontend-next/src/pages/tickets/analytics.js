import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import useGoBack from '@/hooks/useGoBack';
import { ticketsAPI, departmentsAPI } from '@/services/api';
import { BarChart3, Loader2, TrendingUp, Shield, AlertTriangle, CheckCircle, TicketCheck, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

const COLORS = ['#7C3AED', '#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#6366F1', '#EC4899', '#14B8A6'];
const PRIORITY_COLORS = { low: '#94A3B8', medium: '#3B82F6', high: '#F97316', critical: '#EF4444' };

export default function TicketAnalyticsPage() {
  const router = useRouter();
  const { permissions } = useAuth();
  const goBack = useGoBack('/tickets');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');

  useEffect(() => {
    if (!permissions.isManager && !permissions.isHR) {
      router.push('/tickets');
      return;
    }
    departmentsAPI.list().then(r => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async (department_id) => {
    setLoading(true);
    try {
      const params = {};
      if (department_id) params.department_id = department_id;
      const res = await ticketsAPI.analytics(params);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDeptChange = (val) => {
    setDeptFilter(val);
    fetchAnalytics(val || undefined);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-oe-primary" />
    </div>
  );
  if (!data) return <div className="text-center py-20 text-slate-400">Failed to load analytics</div>;

  const s = data.summary || {};
  const trendData = (data.trend || []).map(t => ({
    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Created: parseInt(t.created) || 0,
    Resolved: parseInt(t.resolved) || 0,
  }));

  const priorityData = (data.by_priority || []).map(p => ({
    name: p.priority?.charAt(0).toUpperCase() + p.priority?.slice(1),
    value: parseInt(p.total),
    fill: PRIORITY_COLORS[p.priority] || '#94A3B8',
  }));

  const deptData = (data.by_department || []).map(d => ({
    name: d.department_name,
    tickets: parseInt(d.ticket_count),
    avg_hours: Math.round(parseFloat(d.avg_resolution_hours) || 0),
  }));

  const categoryData = (data.by_category || []).map((c, i) => ({
    name: c.category,
    value: parseInt(c.count),
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-white/40">
        <button onClick={goBack} className="hover:text-oe-primary transition-colors flex items-center gap-1">
          <TicketCheck size={12} /> Tickets
        </button>
        <ChevronRight size={12} />
        <span className="font-medium text-slate-600 dark:text-white/70">Insights</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <BarChart3 size={16} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Insights</h1>
        </div>
        <select
          value={deptFilter}
          onChange={e => handleDeptChange(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-white/80"
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.department_name}</option>)}
        </select>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Tickets', val: s.total_tickets, color: 'text-slate-700 dark:text-white', icon: BarChart3 },
          { label: 'Open', val: s.open_tickets, color: 'text-blue-600', icon: AlertTriangle },
          { label: 'In Progress', val: s.in_progress_tickets, color: 'text-amber-600', icon: TrendingUp },
          { label: 'Resolved', val: s.resolved_tickets, color: 'text-emerald-600', icon: CheckCircle },
          { label: 'SLA Compliance', val: `${data.sla?.compliance_percent || 0}%`, color: data.sla?.compliance_percent >= 90 ? 'text-emerald-600' : 'text-red-600', icon: Shield },
          { label: 'SLA Breaches', val: data.sla?.breached || 0, color: 'text-red-600', icon: AlertTriangle },
        ].map(card => (
          <div key={card.label} className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl p-4 hover:border-oe-primary/30 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <card.icon size={13} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 dark:text-white/35 uppercase tracking-wider">{card.label}</span>
            </div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.val || 0}</div>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend chart */}
        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-white/80 mb-3">7-Day Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Created" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Resolved" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Priority distribution */}
        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-white/80 mb-3">By Priority</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={priorityData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {priorityData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* By department */}
        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-white/80 mb-3">By Department</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={deptData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="tickets" fill="#7C3AED" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By category */}
        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-white/80 mb-3">By Category</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" outerRadius={90} paddingAngle={2} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}>
                {categoryData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SLA Details Table */}
      <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-white/80 mb-3">Department Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/8">
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-white/50 uppercase">Department</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-white/50 uppercase">Tickets</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-white/50 uppercase">Avg Resolution (hrs)</th>
              </tr>
            </thead>
            <tbody>
              {deptData.map(d => (
                <tr key={d.name} className="border-b border-slate-100 dark:border-white/5">
                  <td className="px-3 py-2 font-medium text-slate-700 dark:text-white/80">{d.name}</td>
                  <td className="px-3 py-2 text-center text-slate-600 dark:text-white/60">{d.tickets}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`font-medium ${d.avg_hours <= 24 ? 'text-emerald-600' : d.avg_hours <= 48 ? 'text-amber-600' : 'text-red-600'}`}>
                      {d.avg_hours || '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {deptData.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400 dark:text-white/30">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
