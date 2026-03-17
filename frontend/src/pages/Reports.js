import React, { useState, useEffect } from 'react';
import { reportsAPI } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Download, Users, Calendar, DollarSign, TrendingUp } from 'lucide-react';

const COLORS = ['#1D6BE4', '#7C5CFC', '#00D4FF', '#00D4AA', '#F5A623', '#FF4D6D'];
const fmtCurrency = (n) => n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '$0';

const TABS = [
  { id: 'headcount', label: 'Headcount', icon: Users },
  { id: 'leaves', label: 'Leave Analysis', icon: Calendar },
  { id: 'payroll', label: 'Payroll', icon: DollarSign },
  { id: 'salary', label: 'Salary', icon: TrendingUp },
];

export default function Reports() {
  const [tab, setTab] = useState('headcount');
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      let res;
      if (tab === 'headcount') res = await reportsAPI.headcount({ year });
      else if (tab === 'leaves') res = await reportsAPI.leaves({ year });
      else if (tab === 'payroll') res = await reportsAPI.payroll({ year });
      else if (tab === 'salary') res = await reportsAPI.salary();
      setData(res?.data || {});
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab, year]);

  const printReport = () => window.print();
  const exportCSV = (rows, filename) => {
    if (!rows?.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers, ...rows.map(r => headers.map(h => r[h]))].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click();
  };

  const Spinner = () => (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-oe-card border border-oe-border rounded-xl p-3 shadow-xl">
        <div className="text-xs font-semibold text-oe-muted mb-1">{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="text-sm" style={{ color: p.color }}>{p.name}: <span className="font-semibold">{typeof p.value === 'number' && p.value > 1000 ? fmtCurrency(p.value) : p.value}</span></div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-oe-surface rounded-xl p-1 gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-oe-card text-oe-text shadow' : 'text-oe-muted hover:text-oe-text'}`}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {tab !== 'salary' && (
            <select className="input w-24" value={year} onChange={e => setYear(e.target.value)}>
              {[2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <button onClick={printReport} className="btn-secondary no-print"><Download size={15} /> Print / Export</button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* HEADCOUNT */}
          {tab === 'headcount' && (
            <div className="space-y-5">
              {/* By Department */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-oe-text">Headcount by Department</h3>
                  <button onClick={() => exportCSV(data.byDept, 'headcount_by_dept')} className="text-xs text-oe-primary hover:underline no-print">Export CSV</button>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.byDept} margin={{ left: -20 }}>
                    <XAxis dataKey="department" tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#1D6BE4" radius={[4, 4, 0, 0]} name="Employees" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* By Status */}
                <div className="card">
                  <h3 className="font-semibold text-oe-text mb-4">By Status</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={data.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={40} outerRadius={65} label={({ status, count }) => `${status}: ${count}`} labelLine={false}>
                        {data.byStatus?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* By Gender */}
                <div className="card">
                  <h3 className="font-semibold text-oe-text mb-4">By Gender</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={data.byGender} dataKey="count" nameKey="gender" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                        {data.byGender?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1">
                    {data.byGender?.map((g, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} /><span className="text-oe-muted capitalize">{g.gender}</span></div>
                        <span className="text-oe-text font-medium">{g.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Type */}
                <div className="card">
                  <h3 className="font-semibold text-oe-text mb-4">By Employment Type</h3>
                  <div className="space-y-2">
                    {data.byType?.map((t, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="text-xs text-oe-muted capitalize flex-1">{t.employment_type?.replace('_', ' ')}</div>
                          <div className="h-2 rounded-full bg-oe-border flex-grow-0 w-24 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(t.count / (data.byType?.reduce((a, b) => a + parseInt(b.count), 0) || 1)) * 100}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-oe-text w-8 text-right">{t.count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Hiring Trend */}
              {data.trend?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-oe-text mb-4">Hiring Trend {year}</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data.trend} margin={{ left: -20 }}>
                      <XAxis dataKey="month" tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="hires" stroke="#1D6BE4" strokeWidth={2} dot={{ fill: '#1D6BE4', r: 4 }} name="New Hires" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* LEAVES */}
          {tab === 'leaves' && data.summary && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Requests', value: data.summary.total, color: 'text-oe-text' },
                  { label: 'Approved', value: data.summary.approved, color: 'text-oe-success' },
                  { label: 'Pending', value: data.summary.pending, color: 'text-oe-warning' },
                  { label: 'Days Taken', value: data.summary.total_days_taken, color: 'text-oe-primary' },
                ].map(s => (
                  <div key={s.label} className="stat-card">
                    <div className={`text-2xl font-bold mb-1 ${s.color}`}>{s.value}</div>
                    <div className="text-sm text-oe-muted">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* By Type */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-oe-text">Leave by Type</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.byType} margin={{ left: -20 }}>
                      <XAxis dataKey="name" tick={{ fill: '#6B8DB5', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6B8DB5', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="days_taken" name="Days Taken" radius={[4, 4, 0, 0]}>
                        {data.byType?.map((entry, i) => <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly trend */}
                <div className="card">
                  <h3 className="font-semibold text-oe-text mb-4">Monthly Leave Trend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={data.monthly} margin={{ left: -20 }}>
                      <XAxis dataKey="month" tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="requests" stroke="#7C5CFC" strokeWidth={2} name="Requests" dot={{ fill: '#7C5CFC', r: 3 }} />
                      <Line type="monotone" dataKey="days" stroke="#00D4AA" strokeWidth={2} name="Days" dot={{ fill: '#00D4AA', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top leave takers */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-oe-text">Top Leave Takers</h3>
                  <button onClick={() => exportCSV(data.employees, 'leave_report')} className="text-xs text-oe-primary hover:underline no-print">Export CSV</button>
                </div>
                <table className="w-full">
                  <thead className="bg-oe-surface/50">
                    <tr>
                      {['Employee', 'Department', 'Requests', 'Days Taken'].map(h => <th key={h} className="table-header">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees?.slice(0, 10).map(e => (
                      <tr key={e.name} className="table-row">
                        <td className="table-cell font-medium text-oe-text">{e.name}</td>
                        <td className="table-cell text-oe-muted text-xs">{e.department}</td>
                        <td className="table-cell text-center">{e.total_requests}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 rounded-full bg-oe-border flex-1">
                              <div className="h-full rounded-full bg-oe-primary" style={{ width: `${(e.days_taken / (data.employees?.[0]?.days_taken || 1)) * 100}%` }} />
                            </div>
                            <span className="text-sm text-oe-text w-6">{e.days_taken}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAYROLL */}
          {tab === 'payroll' && (
            <div className="space-y-5">
              {/* Monthly payroll chart */}
              {data.monthly?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-oe-text mb-4">Monthly Payroll {year}</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.monthly} margin={{ left: -10 }}>
                      <XAxis dataKey="month_name" tick={{ fill: '#6B8DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6B8DB5', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ color: '#6B8DB5', fontSize: 12 }} />
                      <Bar dataKey="total_gross" fill="#1D6BE4" radius={[3, 3, 0, 0]} name="Gross" />
                      <Bar dataKey="total_net" fill="#00D4AA" radius={[3, 3, 0, 0]} name="Net" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* By dept */}
              {data.byDept?.length > 0 && (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-oe-text">Payroll by Department</h3>
                    <button onClick={() => exportCSV(data.byDept, 'payroll_by_dept')} className="text-xs text-oe-primary hover:underline no-print">Export CSV</button>
                  </div>
                  <table className="w-full">
                    <thead className="bg-oe-surface/50">
                      <tr>
                        {['Department', 'Employees', 'Total Gross', 'Total Deductions', 'Total Net'].map(h => <th key={h} className="table-header">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDept.map(d => (
                        <tr key={d.department} className="table-row">
                          <td className="table-cell font-medium text-oe-text">{d.department}</td>
                          <td className="table-cell text-center">{d.employees}</td>
                          <td className="table-cell text-oe-success">{fmtCurrency(d.gross)}</td>
                          <td className="table-cell text-oe-danger">-{fmtCurrency(d.deductions)}</td>
                          <td className="table-cell text-oe-primary font-semibold">{fmtCurrency(d.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SALARY */}
          {tab === 'salary' && (
            <div className="space-y-5">
              {/* Dept summary */}
              {data.summary?.length > 0 && (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-oe-text">Salary Summary by Department</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.summary} margin={{ left: -10 }}>
                      <XAxis dataKey="department" tick={{ fill: '#6B8DB5', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6B8DB5', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="avg_gross" fill="#7C5CFC" radius={[3, 3, 0, 0]} name="Avg Gross" />
                      <Bar dataKey="max_gross" fill="#00D4FF" radius={[3, 3, 0, 0]} name="Max Gross" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Employee salary table */}
              {data.employees?.length > 0 && (
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-oe-border">
                    <span className="font-semibold text-oe-text text-sm">Employee Salary Details</span>
                    <button onClick={() => exportCSV(data.employees, 'salary_report')} className="text-xs text-oe-primary hover:underline no-print">Export CSV</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-oe-surface/50">
                        <tr>
                          {['Employee', 'Department', 'Position', 'Grade', 'Basic', 'Gross', 'Net'].map(h => <th key={h} className="table-header">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {data.employees.map(e => (
                          <tr key={e.emp_code} className="table-row">
                            <td className="table-cell font-medium text-oe-text">{e.name}</td>
                            <td className="table-cell text-xs text-oe-muted">{e.department}</td>
                            <td className="table-cell text-xs text-oe-muted">{e.position}</td>
                            <td className="table-cell text-xs"><span className="px-2 py-0.5 bg-oe-surface rounded text-oe-muted">{e.grade || '-'}</span></td>
                            <td className="table-cell">{fmtCurrency(e.basic_salary)}</td>
                            <td className="table-cell text-oe-success">{fmtCurrency(e.gross_salary)}</td>
                            <td className="table-cell text-oe-primary font-semibold">{fmtCurrency(e.net_salary)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
