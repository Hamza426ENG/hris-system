import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { transportAPI } from '@/services/api';
import {
  Bus, MapPin, Users, Truck, AlertCircle, CheckCircle2,
  Clock, XCircle, PauseCircle, Plus, Pencil, Trash2,
  ChevronDown, ChevronUp, RefreshCw, MessageSquare, X,
  Check, Ban, Play, LayoutList, History
} from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt12 = (t) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_MAP = {
  active:    { label: 'Active',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', Icon: CheckCircle2 },
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',         Icon: Clock },
  inactive:  { label: 'Inactive',  color: 'bg-slate-100 text-slate-500 dark:bg-slate-500/20 dark:text-slate-400',         Icon: XCircle },
  suspended: { label: 'Suspended', color: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400',                 Icon: PauseCircle },
};
const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.inactive;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.color}`}>
      <s.Icon size={11} />
      {s.label}
    </span>
  );
};

const ISSUE_TYPE_MAP = {
  complaint:   { label: 'Complaint',   color: 'bg-red-100 text-red-600' },
  feedback:    { label: 'Feedback',    color: 'bg-blue-100 text-blue-600' },
  delay:       { label: 'Delay',       color: 'bg-amber-100 text-amber-700' },
  missed_ride: { label: 'Missed Ride', color: 'bg-purple-100 text-purple-600' },
};

const ISSUE_STATUS_MAP = {
  open:        'bg-red-100 text-red-600',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-slate-100 text-slate-500',
};

// ─── Modal wrapper ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-oe-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-oe-border flex-shrink-0">
          <h2 className="font-semibold text-oe-text">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-oe-bg transition-colors text-oe-muted"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ─── Input helpers ────────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium text-oe-muted mb-1">{label}</label>
    {children}
  </div>
);
const inputCls = 'w-full text-sm bg-oe-bg border border-oe-border rounded-lg px-3 py-2 text-oe-text focus:outline-none focus:border-oe-primary transition-colors';

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS_ADMIN = ['Overview', 'Routes', 'Vehicles', 'Enrollments', 'Usage', 'Issues'];
const TABS_EMP   = ['My Transport', 'History', 'Raise Issue'];

// ═════════════════════════════════════════════════════════════════════════════
function TransportContent() {
  const { user } = useAuth();
  const isAdmin = ['super_admin', 'hr_admin'].includes(user?.role);
  const TABS = isAdmin ? TABS_ADMIN : TABS_EMP;
  const [tab, setTab] = useState(TABS[0]);

  // shared state
  const [routes,      setRoutes]      = useState([]);
  const [vehicles,    setVehicles]    = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [myEnroll,    setMyEnroll]    = useState(null);
  const [usage,       setUsage]       = useState([]);
  const [issues,      setIssues]      = useState([]);
  const [myHistory,   setMyHistory]   = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const [r, v, en, u, iss, st] = await Promise.all([
          transportAPI.listRoutes(),
          transportAPI.listVehicles(),
          transportAPI.listEnrollments(),
          transportAPI.listUsage({ date: new Date().toISOString().slice(0, 10) }),
          transportAPI.listIssues(),
          transportAPI.stats(),
        ]);
        setRoutes(r.data || []);
        setVehicles(v.data || []);
        setEnrollments(en.data || []);
        setUsage(u.data || []);
        setIssues(iss.data || []);
        setStats(st.data);
      } else {
        const [en, hist, iss, r] = await Promise.all([
          transportAPI.myEnrollment(),
          transportAPI.myHistory(),
          transportAPI.listIssues(),
          transportAPI.listRoutes({ active: true }),
        ]);
        setMyEnroll(en.data);
        setMyHistory(hist.data || []);
        setIssues(iss.data || []);
        setRoutes(r.data || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
            <Bus size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-oe-text">Transport</h1>
            <p className="text-xs text-oe-muted">Company transport management</p>
          </div>
        </div>
        <button onClick={loadAll} className="p-2 rounded-lg border border-oe-border text-oe-muted hover:text-oe-primary transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Stats — admin only */}
      {isAdmin && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active Vehicles', value: stats.active_vehicles, color: 'text-oe-primary' },
            { label: 'Active Routes',   value: stats.active_routes,   color: 'text-blue-500' },
            { label: 'Enrolled',        value: stats.enrollments?.active || 0, color: 'text-oe-success' },
            { label: "Today's Riders",  value: stats.today_riders,    color: 'text-purple-500' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-oe-muted font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-oe-bg rounded-xl p-1 border border-oe-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-oe-surface shadow text-oe-primary' : 'text-oe-muted hover:text-oe-text'
            }`}
          >{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview'      && <AdminOverview enrollments={enrollments} issues={issues} routes={routes} />}
      {tab === 'Routes'        && <RoutesTab routes={routes} vehicles={vehicles} setRoutes={setRoutes} reload={loadAll} />}
      {tab === 'Vehicles'      && <VehiclesTab vehicles={vehicles} setVehicles={setVehicles} />}
      {tab === 'Enrollments'   && <EnrollmentsTab enrollments={enrollments} routes={routes} setEnrollments={setEnrollments} reload={loadAll} />}
      {tab === 'Usage'         && <UsageTab usage={usage} setUsage={setUsage} enrollments={enrollments} routes={routes} reload={loadAll} />}
      {tab === 'Issues'        && <IssuesTab issues={issues} isAdmin={isAdmin} setIssues={setIssues} reload={loadAll} />}
      {tab === 'My Transport'  && <MyTransportTab myEnroll={myEnroll} setMyEnroll={setMyEnroll} routes={routes} reload={loadAll} />}
      {tab === 'History'       && <HistoryTab history={myHistory} />}
      {tab === 'Raise Issue'   && <RaiseIssueTab routes={routes} reload={loadAll} setTab={setTab} />}
    </div>
  );
}

// ─── ADMIN OVERVIEW ───────────────────────────────────────────────────────────
function AdminOverview({ enrollments, issues, routes }) {
  const pending   = enrollments.filter(e => e.status === 'pending');
  const openIssues = issues.filter(i => i.status === 'open');

  return (
    <div className="space-y-4">
      {/* Pending enrollments */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-oe-border/50 flex items-center gap-2">
          <Clock size={14} className="text-amber-500" />
          <span className="font-semibold text-sm text-oe-text">Pending Enrollments</span>
          {pending.length > 0 && <span className="ml-auto text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-semibold">{pending.length}</span>}
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-oe-muted text-center py-8">No pending enrollment requests</p>
        ) : (
          <div className="divide-y divide-oe-border/30">
            {pending.slice(0, 5).map(e => (
              <div key={e.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-oe-text">{e.employee_name}</p>
                  <p className="text-xs text-oe-muted">{e.emp_code} · {e.department_name || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-oe-muted">Requested {fmtDate(e.created_at)}</p>
                  <StatusBadge status={e.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open issues */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-oe-border/50 flex items-center gap-2">
          <AlertCircle size={14} className="text-red-500" />
          <span className="font-semibold text-sm text-oe-text">Open Issues</span>
          {openIssues.length > 0 && <span className="ml-auto text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-semibold">{openIssues.length}</span>}
        </div>
        {openIssues.length === 0 ? (
          <p className="text-sm text-oe-muted text-center py-8">No open issues</p>
        ) : (
          <div className="divide-y divide-oe-border/30">
            {openIssues.slice(0, 5).map(i => (
              <div key={i.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-oe-text">{i.employee_name}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${(ISSUE_TYPE_MAP[i.issue_type] || ISSUE_TYPE_MAP.complaint).color}`}>
                    {(ISSUE_TYPE_MAP[i.issue_type] || ISSUE_TYPE_MAP.complaint).label}
                  </span>
                </div>
                <p className="text-xs text-oe-muted line-clamp-2">{i.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Route summary */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-oe-border/50 flex items-center gap-2">
          <MapPin size={14} className="text-oe-primary" />
          <span className="font-semibold text-sm text-oe-text">Active Routes</span>
        </div>
        {routes.filter(r => r.is_active).length === 0 ? (
          <p className="text-sm text-oe-muted text-center py-8">No active routes</p>
        ) : (
          <div className="divide-y divide-oe-border/30">
            {routes.filter(r => r.is_active).map(r => (
              <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-oe-text">{r.route_name}</p>
                  <p className="text-xs text-oe-muted">{r.area || '—'} · {r.vehicle_name || 'No vehicle'}</p>
                </div>
                <div className="text-right text-xs text-oe-muted">
                  <p>{fmt12(r.departure_time)} → {fmt12(r.return_time)}</p>
                  <p>{r.enrolled_count || 0} enrolled</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROUTES TAB ───────────────────────────────────────────────────────────────
const EMPTY_ROUTE = { route_name: '', area: '', departure_time: '', return_time: '', vehicle_id: '', notes: '', is_active: true };
const EMPTY_STOP  = { stop_name: '', stop_order: 1, pickup_time: '', dropoff_time: '', area: '' };

function RoutesTab({ routes, vehicles, setRoutes, reload }) {
  const [modal,    setModal]    = useState(null); // null | 'route' | 'stop'
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(EMPTY_ROUTE);
  const [stopForm, setStopForm] = useState(EMPTY_STOP);
  const [activeRoute, setActiveRoute] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState({});

  const openCreate = () => { setEditing(null); setForm(EMPTY_ROUTE); setModal('route'); };
  const openEdit   = (r)  => { setEditing(r); setForm({ route_name: r.route_name, area: r.area || '', departure_time: r.departure_time?.slice(0,5) || '', return_time: r.return_time?.slice(0,5) || '', vehicle_id: r.vehicle_id || '', notes: r.notes || '', is_active: r.is_active }); setModal('route'); };
  const openStop   = (r)  => { setActiveRoute(r); setStopForm({ ...EMPTY_STOP, stop_order: (r.stops?.length || 0) + 1 }); setModal('stop'); };

  const saveRoute = async () => {
    if (!form.route_name) return;
    setSaving(true);
    try {
      if (editing) {
        await transportAPI.updateRoute(editing.id, form);
      } else {
        await transportAPI.createRoute(form);
      }
      await reload();
      setModal(null);
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteRoute = async (id) => {
    if (!confirm('Delete this route?')) return;
    try { await transportAPI.deleteRoute(id); await reload(); } catch (e) { alert('Failed to delete'); }
  };

  const saveStop = async () => {
    if (!stopForm.stop_name || !activeRoute) return;
    setSaving(true);
    try {
      await transportAPI.addStop(activeRoute.id, stopForm);
      await reload();
      setModal(null);
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteStop = async (id) => {
    if (!confirm('Delete this stop?')) return;
    try { await transportAPI.deleteStop(id); await reload(); } catch { alert('Failed'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-bg text-white text-sm font-medium">
          <Plus size={14} /> Add Route
        </button>
      </div>

      {routes.length === 0 ? (
        <div className="card p-8 text-center text-oe-muted text-sm">No routes yet. Create your first route.</div>
      ) : (
        routes.map(r => (
          <div key={r.id} className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.is_active ? 'bg-oe-success' : 'bg-oe-muted'}`} />
                <div className="min-w-0">
                  <p className="font-medium text-oe-text text-sm truncate">{r.route_name}</p>
                  <p className="text-xs text-oe-muted">
                    {r.area || '—'} · {r.vehicle_name || 'No vehicle'} · {fmt12(r.departure_time)} → {fmt12(r.return_time)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <span className="text-xs text-oe-muted">{r.enrolled_count || 0} enrolled</span>
                <button onClick={() => openStop(r)} className="p-1.5 rounded-lg text-oe-muted hover:text-oe-primary transition-colors" title="Add stop"><MapPin size={14} /></button>
                <button onClick={() => openEdit(r)}   className="p-1.5 rounded-lg text-oe-muted hover:text-oe-primary transition-colors"><Pencil size={14} /></button>
                <button onClick={() => deleteRoute(r.id)} className="p-1.5 rounded-lg text-oe-muted hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                <button onClick={() => setExpanded(p => ({ ...p, [r.id]: !p[r.id] }))} className="p-1.5 rounded-lg text-oe-muted hover:text-oe-text transition-colors">
                  {expanded[r.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>
            {expanded[r.id] && (
              <div className="border-t border-oe-border/50 bg-oe-bg/50 px-4 py-3">
                <p className="text-[11px] font-semibold text-oe-muted uppercase tracking-wide mb-2">Stops</p>
                {(!r.stops || r.stops.length === 0) ? (
                  <p className="text-xs text-oe-muted">No stops added yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {r.stops.map((s, idx) => (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-oe-primary/10 text-oe-primary text-center text-[10px] font-bold leading-5">{idx + 1}</span>
                          <span className="text-oe-text font-medium">{s.stop_name}</span>
                          {s.area && <span className="text-oe-muted">({s.area})</span>}
                          {s.pickup_time && <span className="text-oe-muted ml-1">↑{fmt12(s.pickup_time)}</span>}
                          {s.dropoff_time && <span className="text-oe-muted ml-1">↓{fmt12(s.dropoff_time)}</span>}
                        </div>
                        <button onClick={() => deleteStop(s.id)} className="p-1 rounded text-oe-muted hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {r.notes && <p className="text-xs text-oe-muted mt-2 italic">{r.notes}</p>}
              </div>
            )}
          </div>
        ))
      )}

      {/* Route modal */}
      {modal === 'route' && (
        <Modal title={editing ? 'Edit Route' : 'Add Route'} onClose={() => setModal(null)}>
          <Field label="Route Name *"><input className={inputCls} value={form.route_name} onChange={e => setForm(p => ({ ...p, route_name: e.target.value }))} placeholder="e.g. DHA – Office" /></Field>
          <Field label="Area / Region"><input className={inputCls} value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} placeholder="e.g. DHA Phase 6" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Departure Time"><input type="time" className={inputCls} value={form.departure_time} onChange={e => setForm(p => ({ ...p, departure_time: e.target.value }))} /></Field>
            <Field label="Return Time"><input type="time" className={inputCls} value={form.return_time} onChange={e => setForm(p => ({ ...p, return_time: e.target.value }))} /></Field>
          </div>
          <Field label="Vehicle">
            <select className={inputCls} value={form.vehicle_id} onChange={e => setForm(p => ({ ...p, vehicle_id: e.target.value }))}>
              <option value="">No vehicle assigned</option>
              {vehicles.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.vehicle_name} ({v.plate_number})</option>)}
            </select>
          </Field>
          <Field label="Notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></Field>
          <label className="flex items-center gap-2 text-sm text-oe-text cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
            Active
          </label>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(null)} className="flex-1 px-4 py-2 rounded-lg border border-oe-border text-oe-muted text-sm">Cancel</button>
            <button onClick={saveRoute} disabled={saving} className="flex-1 px-4 py-2 rounded-lg gradient-bg text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* Stop modal */}
      {modal === 'stop' && (
        <Modal title={`Add Stop — ${activeRoute?.route_name}`} onClose={() => setModal(null)}>
          <Field label="Stop Name *"><input className={inputCls} value={stopForm.stop_name} onChange={e => setStopForm(p => ({ ...p, stop_name: e.target.value }))} placeholder="e.g. DHA Phase 5 Gate" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order"><input type="number" className={inputCls} min={1} value={stopForm.stop_order} onChange={e => setStopForm(p => ({ ...p, stop_order: +e.target.value }))} /></Field>
            <Field label="Area"><input className={inputCls} value={stopForm.area} onChange={e => setStopForm(p => ({ ...p, area: e.target.value }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pickup Time"><input type="time" className={inputCls} value={stopForm.pickup_time} onChange={e => setStopForm(p => ({ ...p, pickup_time: e.target.value }))} /></Field>
            <Field label="Drop-off Time"><input type="time" className={inputCls} value={stopForm.dropoff_time} onChange={e => setStopForm(p => ({ ...p, dropoff_time: e.target.value }))} /></Field>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(null)} className="flex-1 px-4 py-2 rounded-lg border border-oe-border text-oe-muted text-sm">Cancel</button>
            <button onClick={saveStop} disabled={saving} className="flex-1 px-4 py-2 rounded-lg gradient-bg text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Add Stop'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── VEHICLES TAB ─────────────────────────────────────────────────────────────
const EMPTY_VEHICLE = { vehicle_name: '', plate_number: '', vehicle_type: 'bus', capacity: 20, driver_name: '', driver_phone: '', notes: '', is_active: true };

function VehiclesTab({ vehicles, setVehicles }) {
  const [modal,   setModal]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState(EMPTY_VEHICLE);
  const [saving,  setSaving]  = useState(false);

  const openCreate = () => { setEditing(null); setForm(EMPTY_VEHICLE); setModal(true); };
  const openEdit   = (v)  => { setEditing(v); setForm({ vehicle_name: v.vehicle_name, plate_number: v.plate_number, vehicle_type: v.vehicle_type, capacity: v.capacity, driver_name: v.driver_name || '', driver_phone: v.driver_phone || '', notes: v.notes || '', is_active: v.is_active }); setModal(true); };

  const save = async () => {
    if (!form.vehicle_name || !form.plate_number) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await transportAPI.updateVehicle(editing.id, form);
        setVehicles(p => p.map(v => v.id === editing.id ? res.data : v));
      } else {
        const res = await transportAPI.createVehicle(form);
        setVehicles(p => [res.data, ...p]);
      }
      setModal(false);
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!confirm('Delete this vehicle?')) return;
    try { await transportAPI.deleteVehicle(id); setVehicles(p => p.filter(v => v.id !== id)); } catch { alert('Failed'); }
  };

  const TYPE_ICON = { bus: '🚌', van: '🚐', car: '🚗' };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-bg text-white text-sm font-medium">
          <Plus size={14} /> Add Vehicle
        </button>
      </div>

      {vehicles.length === 0 ? (
        <div className="card p-8 text-center text-oe-muted text-sm">No vehicles yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vehicles.map(v => (
            <div key={v.id} className={`card p-4 ${!v.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{TYPE_ICON[v.vehicle_type] || '🚌'}</span>
                  <div>
                    <p className="font-semibold text-oe-text text-sm">{v.vehicle_name}</p>
                    <p className="text-xs text-oe-muted font-mono">{v.plate_number}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(v)}  className="p-1.5 rounded-lg text-oe-muted hover:text-oe-primary transition-colors"><Pencil size={13} /></button>
                  <button onClick={() => del(v.id)}    className="p-1.5 rounded-lg text-oe-muted hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-oe-muted">Capacity: </span><span className="text-oe-text font-medium">{v.capacity}</span></div>
                <div><span className="text-oe-muted">Assigned: </span><span className="text-oe-text font-medium">{v.assigned_routes || 0} routes</span></div>
                {v.driver_name && <div className="col-span-2"><span className="text-oe-muted">Driver: </span><span className="text-oe-text font-medium">{v.driver_name}</span></div>}
                {v.driver_phone && <div className="col-span-2"><span className="text-oe-muted">Phone: </span><span className="text-oe-text font-medium">{v.driver_phone}</span></div>}
              </div>
              {!v.is_active && <span className="mt-2 inline-block text-[11px] text-oe-muted">Inactive</span>}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={editing ? 'Edit Vehicle' : 'Add Vehicle'} onClose={() => setModal(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehicle Name *"><input className={inputCls} value={form.vehicle_name} onChange={e => setForm(p => ({ ...p, vehicle_name: e.target.value }))} placeholder="e.g. Coaster 1" /></Field>
            <Field label="Plate Number *"><input className={inputCls} value={form.plate_number} onChange={e => setForm(p => ({ ...p, plate_number: e.target.value }))} placeholder="ABC-123" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className={inputCls} value={form.vehicle_type} onChange={e => setForm(p => ({ ...p, vehicle_type: e.target.value }))}>
                <option value="bus">Bus</option><option value="van">Van</option><option value="car">Car</option>
              </select>
            </Field>
            <Field label="Capacity"><input type="number" className={inputCls} min={1} value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: +e.target.value }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Driver Name"><input className={inputCls} value={form.driver_name} onChange={e => setForm(p => ({ ...p, driver_name: e.target.value }))} /></Field>
            <Field label="Driver Phone"><input className={inputCls} value={form.driver_phone} onChange={e => setForm(p => ({ ...p, driver_phone: e.target.value }))} /></Field>
          </div>
          <Field label="Notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></Field>
          <label className="flex items-center gap-2 text-sm text-oe-text cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
            Active
          </label>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 px-4 py-2 rounded-lg border border-oe-border text-oe-muted text-sm">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 rounded-lg gradient-bg text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ENROLLMENTS TAB ──────────────────────────────────────────────────────────
function EnrollmentsTab({ enrollments, routes, setEnrollments, reload }) {
  const [filter, setFilter] = useState('all');
  const [assigning, setAssigning] = useState(null);
  const [assignForm, setAssignForm] = useState({ route_id: '', stop_id: '' });
  const [stops, setStops] = useState([]);
  const [saving, setSaving] = useState(false);

  const filtered = filter === 'all' ? enrollments : enrollments.filter(e => e.status === filter);

  const action = async (id, type) => {
    setSaving(true);
    try {
      if (type === 'approve') await transportAPI.approveEnrollment(id);
      else if (type === 'reject') await transportAPI.rejectEnrollment(id);
      else if (type === 'suspend') await transportAPI.suspendEnrollment(id);
      else if (type === 'activate') await transportAPI.activateEnrollment(id);
      await reload();
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const openAssign = async (e) => {
    setAssigning(e);
    setAssignForm({ route_id: e.route_id || '', stop_id: e.stop_id || '' });
    if (e.route_id) {
      const r = routes.find(r => r.id === e.route_id);
      setStops(r?.stops || []);
    } else setStops([]);
  };

  const onRouteChange = (routeId) => {
    setAssignForm(p => ({ ...p, route_id: routeId, stop_id: '' }));
    const r = routes.find(r => r.id === routeId);
    setStops(r?.stops || []);
  };

  const saveAssign = async () => {
    setSaving(true);
    try {
      await transportAPI.assignEnrollment(assigning.id, assignForm);
      await reload();
      setAssigning(null);
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {['all', 'pending', 'active', 'inactive', 'suspended'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-oe-primary text-white' : 'bg-oe-bg border border-oe-border text-oe-muted hover:text-oe-text'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' ? ` (${enrollments.length})` : ` (${enrollments.filter(e => e.status === f).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-oe-muted text-sm">No enrollments found.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-oe-surface/80">
                  {['Employee', 'Route / Stop', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-oe-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-b border-oe-border/30 hover:bg-oe-bg/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-oe-text">{e.employee_name}</p>
                      <p className="text-[11px] text-oe-muted">{e.emp_code} · {e.department_name || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-oe-text">{e.route_name || <span className="text-oe-muted/50">Unassigned</span>}</p>
                      {e.stop_name && <p className="text-[11px] text-oe-muted">{e.stop_name}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-3 text-xs text-oe-muted">{fmtDate(e.enrollment_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {e.status === 'pending' && (
                          <>
                            <button onClick={() => action(e.id, 'approve')} disabled={saving} title="Approve" className="p-1.5 rounded-lg text-oe-success hover:bg-oe-success/10 transition-colors"><Check size={14} /></button>
                            <button onClick={() => action(e.id, 'reject')}  disabled={saving} title="Reject"  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><X size={14} /></button>
                          </>
                        )}
                        {e.status === 'active' && (
                          <button onClick={() => action(e.id, 'suspend')} disabled={saving} title="Suspend" className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors"><Ban size={14} /></button>
                        )}
                        {e.status === 'suspended' && (
                          <button onClick={() => action(e.id, 'activate')} disabled={saving} title="Activate" className="p-1.5 rounded-lg text-oe-success hover:bg-oe-success/10 transition-colors"><Play size={14} /></button>
                        )}
                        <button onClick={() => openAssign(e)} title="Assign Route" className="p-1.5 rounded-lg text-oe-primary hover:bg-oe-primary/10 transition-colors"><MapPin size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {assigning && (
        <Modal title={`Assign Route — ${assigning.employee_name}`} onClose={() => setAssigning(null)}>
          <Field label="Route">
            <select className={inputCls} value={assignForm.route_id} onChange={e => onRouteChange(e.target.value)}>
              <option value="">No route</option>
              {routes.filter(r => r.is_active).map(r => <option key={r.id} value={r.id}>{r.route_name} ({r.area || '—'})</option>)}
            </select>
          </Field>
          {stops.length > 0 && (
            <Field label="Pickup / Drop-off Stop">
              <select className={inputCls} value={assignForm.stop_id} onChange={e => setAssignForm(p => ({ ...p, stop_id: e.target.value }))}>
                <option value="">No specific stop</option>
                {stops.map(s => <option key={s.id} value={s.id}>{s.stop_name} {s.area ? `(${s.area})` : ''}</option>)}
              </select>
            </Field>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAssigning(null)} className="flex-1 px-4 py-2 rounded-lg border border-oe-border text-oe-muted text-sm">Cancel</button>
            <button onClick={saveAssign} disabled={saving} className="flex-1 px-4 py-2 rounded-lg gradient-bg text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── USAGE TAB ────────────────────────────────────────────────────────────────
function UsageTab({ usage, setUsage, enrollments, routes, reload }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await transportAPI.listUsage({ date });
      setUsage(res.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const mark = async (employeeId, routeId, field, val) => {
    const existing = usage.find(u => u.employee_id === employeeId);
    setMarking(employeeId);
    try {
      await transportAPI.markUsage({
        employee_id:  employeeId,
        route_id:     routeId,
        usage_date:   date,
        used_pickup:  field === 'pickup'  ? val : (existing?.used_pickup  || false),
        used_dropoff: field === 'dropoff' ? val : (existing?.used_dropoff || false),
      });
      await load();
    } catch { alert('Failed to mark usage'); }
    finally { setMarking(null); }
  };

  const activeEnrollees = enrollments.filter(e => e.status === 'active');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input type="date" className={`${inputCls} max-w-xs`} value={date} onChange={e => setDate(e.target.value)} />
        <button onClick={load} className="px-4 py-2 rounded-lg border border-oe-border text-oe-muted text-sm hover:text-oe-primary transition-colors flex items-center gap-2">
          <RefreshCw size={13} /> Load
        </button>
        <span className="text-xs text-oe-muted ml-auto">{activeEnrollees.length} active employees</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : activeEnrollees.length === 0 ? (
        <div className="card p-8 text-center text-oe-muted text-sm">No active enrollments to track.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-oe-surface/80">
                  {['Employee', 'Route', 'Pickup', 'Drop-off'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-oe-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeEnrollees.map(e => {
                  const u = usage.find(u => u.employee_id === e.employee_id);
                  const isMarking = marking === e.employee_id;
                  return (
                    <tr key={e.id} className="border-b border-oe-border/30 hover:bg-oe-bg/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-oe-text">{e.employee_name}</p>
                        <p className="text-[11px] text-oe-muted">{e.emp_code}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-oe-muted">{e.route_name || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => mark(e.employee_id, e.route_id, 'pickup', !u?.used_pickup)}
                          disabled={isMarking}
                          className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-colors ${u?.used_pickup ? 'border-oe-success bg-oe-success/10 text-oe-success' : 'border-oe-border text-oe-muted hover:border-oe-success'}`}
                        >
                          {u?.used_pickup ? <CheckCircle2 size={14} /> : <div className="w-3 h-3 rounded-full border-2 border-current" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => mark(e.employee_id, e.route_id, 'dropoff', !u?.used_dropoff)}
                          disabled={isMarking}
                          className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-colors ${u?.used_dropoff ? 'border-oe-success bg-oe-success/10 text-oe-success' : 'border-oe-border text-oe-muted hover:border-oe-success'}`}
                        >
                          {u?.used_dropoff ? <CheckCircle2 size={14} /> : <div className="w-3 h-3 rounded-full border-2 border-current" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ISSUES TAB (shared) ──────────────────────────────────────────────────────
function IssuesTab({ issues, isAdmin, setIssues, reload }) {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? issues : issues.filter(i => i.status === filter);

  const action = async (id, type) => {
    try {
      if (type === 'resolve') await transportAPI.resolveIssue(id);
      else if (type === 'close') await transportAPI.closeIssue(id);
      await reload();
    } catch { alert('Failed'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {['all', 'open', 'resolved', 'closed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-oe-primary text-white' : 'bg-oe-bg border border-oe-border text-oe-muted hover:text-oe-text'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)} ({f === 'all' ? issues.length : issues.filter(i => i.status === f).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-oe-muted text-sm">No issues found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(i => (
            <div key={i.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${(ISSUE_TYPE_MAP[i.issue_type] || ISSUE_TYPE_MAP.complaint).color}`}>
                    {(ISSUE_TYPE_MAP[i.issue_type] || ISSUE_TYPE_MAP.complaint).label}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ISSUE_STATUS_MAP[i.status] || ISSUE_STATUS_MAP.open}`}>
                    {i.status.replace('_', ' ')}
                  </span>
                </div>
                {isAdmin && i.status === 'open' && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => action(i.id, 'resolve')} className="px-2.5 py-1 rounded-lg text-xs bg-oe-success/10 text-oe-success hover:bg-oe-success/20 transition-colors">Resolve</button>
                    <button onClick={() => action(i.id, 'close')}   className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">Close</button>
                  </div>
                )}
              </div>
              <p className="text-sm text-oe-text mb-1">{i.description}</p>
              <div className="flex items-center gap-3 text-[11px] text-oe-muted mt-2 flex-wrap">
                {isAdmin && <span className="font-medium">{i.employee_name}</span>}
                {i.route_name && <span>Route: {i.route_name}</span>}
                <span>{fmtDate(i.created_at)}</span>
                {i.resolved_by_name && <span>Resolved by {i.resolved_by_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MY TRANSPORT TAB ─────────────────────────────────────────────────────────
function MyTransportTab({ myEnroll, setMyEnroll, routes, reload }) {
  const [enrollModal, setEnrollModal] = useState(false);
  const [form, setForm] = useState({ route_id: '', stop_id: '', notes: '' });
  const [stops, setStops] = useState([]);
  const [saving, setSaving] = useState(false);

  const onRouteChange = (routeId) => {
    setForm(p => ({ ...p, route_id: routeId, stop_id: '' }));
    const r = routes.find(r => r.id === routeId);
    setStops(r?.stops || []);
  };

  const enroll = async () => {
    setSaving(true);
    try {
      await transportAPI.enroll(form);
      await reload();
      setEnrollModal(false);
    } catch (e) { alert(e.response?.data?.error || 'Failed to submit request'); }
    finally { setSaving(false); }
  };

  const cancel = async () => {
    if (!confirm('Cancel your transport enrollment?')) return;
    try { await transportAPI.cancelEnrollment(); await reload(); } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  };

  const s = myEnroll ? (STATUS_MAP[myEnroll.status] || STATUS_MAP.inactive) : null;

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-oe-text">Transport Status</h3>
          {myEnroll && <StatusBadge status={myEnroll.status} />}
        </div>

        {!myEnroll ? (
          <div className="text-center py-4">
            <Bus size={40} className="mx-auto text-oe-muted opacity-30 mb-3" />
            <p className="text-sm text-oe-muted mb-4">You are not enrolled in company transport.</p>
            <button onClick={() => setEnrollModal(true)} className="px-5 py-2 rounded-lg gradient-bg text-white text-sm font-medium">Request Transport</button>
          </div>
        ) : (
          <>
            {/* Status indicator */}
            <div className={`flex items-center gap-3 p-3 rounded-xl mb-4 ${
              myEnroll.status === 'active'    ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20' :
              myEnroll.status === 'pending'   ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20' :
              myEnroll.status === 'suspended' ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20' :
              'bg-oe-bg border border-oe-border'
            }`}>
              {s && <s.Icon size={20} className={
                myEnroll.status === 'active' ? 'text-oe-success' :
                myEnroll.status === 'pending' ? 'text-amber-500' :
                myEnroll.status === 'suspended' ? 'text-red-500' : 'text-oe-muted'
              } />}
              <div>
                <p className="text-sm font-semibold text-oe-text">
                  {myEnroll.status === 'active'    && 'Transport Active — You are enrolled in company transport.'}
                  {myEnroll.status === 'pending'   && 'Request Pending — Awaiting HR approval.'}
                  {myEnroll.status === 'suspended' && 'Transport Suspended — Contact HR for details.'}
                  {myEnroll.status === 'inactive'  && 'Not Enrolled — Your enrollment is inactive.'}
                </p>
              </div>
            </div>

            {/* Details grid */}
            {myEnroll.status === 'active' && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Route',        value: myEnroll.route_name || '—' },
                  { label: 'Area',         value: myEnroll.route_area || '—' },
                  { label: 'Pickup Stop',  value: myEnroll.stop_name || '—' },
                  { label: 'Pickup Time',  value: fmt12(myEnroll.pickup_time) },
                  { label: 'Departure',    value: fmt12(myEnroll.departure_time) },
                  { label: 'Return',       value: fmt12(myEnroll.return_time) },
                  { label: 'Vehicle',      value: myEnroll.vehicle_name || '—' },
                  { label: 'Driver',       value: myEnroll.driver_name || '—' },
                  { label: 'Driver Phone', value: myEnroll.driver_phone || '—' },
                  { label: 'Plate',        value: myEnroll.plate_number || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-oe-bg rounded-lg p-3 border border-oe-border">
                    <p className="text-[11px] text-oe-muted">{label}</p>
                    <p className="text-sm font-medium text-oe-text mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              {['inactive', 'suspended'].includes(myEnroll.status) && (
                <button onClick={() => setEnrollModal(true)} className="flex-1 px-4 py-2 rounded-lg gradient-bg text-white text-sm font-medium">Re-apply</button>
              )}
              {['active', 'pending'].includes(myEnroll.status) && (
                <button onClick={cancel} className="px-4 py-2 rounded-lg border border-red-200 text-red-500 text-sm hover:bg-red-50 transition-colors">Cancel Enrollment</button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Enroll modal */}
      {enrollModal && (
        <Modal title="Request Transport" onClose={() => setEnrollModal(false)}>
          <Field label="Preferred Route">
            <select className={inputCls} value={form.route_id} onChange={e => onRouteChange(e.target.value)}>
              <option value="">Select a route (optional)</option>
              {routes.filter(r => r.is_active).map(r => (
                <option key={r.id} value={r.id}>{r.route_name} ({r.area || '—'}) — {fmt12(r.departure_time)}</option>
              ))}
            </select>
          </Field>
          {stops.length > 0 && (
            <Field label="Preferred Pickup Stop">
              <select className={inputCls} value={form.stop_id} onChange={e => setForm(p => ({ ...p, stop_id: e.target.value }))}>
                <option value="">No preference</option>
                {stops.map(s => <option key={s.id} value={s.id}>{s.stop_name} {s.area ? `(${s.area})` : ''} {fmt12(s.pickup_time)}</option>)}
              </select>
            </Field>
          )}
          <Field label="Notes / Special Requirements">
            <textarea className={inputCls} rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any special requirements…" />
          </Field>
          <p className="text-xs text-oe-muted">Your request will be reviewed by HR. You will be notified once approved.</p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setEnrollModal(false)} className="flex-1 px-4 py-2 rounded-lg border border-oe-border text-oe-muted text-sm">Cancel</button>
            <button onClick={enroll} disabled={saving} className="flex-1 px-4 py-2 rounded-lg gradient-bg text-white text-sm font-medium disabled:opacity-50">{saving ? 'Submitting…' : 'Submit Request'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── HISTORY TAB ──────────────────────────────────────────────────────────────
function HistoryTab({ history }) {
  if (history.length === 0) return (
    <div className="card p-8 text-center text-oe-muted text-sm">
      <History size={32} className="mx-auto mb-3 opacity-30" />
      No transport usage history found.
    </div>
  );
  return (
    <div className="card overflow-hidden">
      <div className="overflow-auto max-h-[500px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-oe-surface/80">
              {['Date', 'Route', 'Pickup', 'Drop-off'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-oe-muted uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map(h => (
              <tr key={h.id} className="border-b border-oe-border/30 hover:bg-oe-bg/50 transition-colors">
                <td className="px-4 py-3 font-medium text-oe-text">{fmtDate(h.usage_date)}</td>
                <td className="px-4 py-3 text-oe-muted">{h.route_name || '—'}</td>
                <td className="px-4 py-3">{h.used_pickup  ? <CheckCircle2 size={15} className="text-oe-success" /> : <XCircle size={15} className="text-oe-muted opacity-30" />}</td>
                <td className="px-4 py-3">{h.used_dropoff ? <CheckCircle2 size={15} className="text-oe-success" /> : <XCircle size={15} className="text-oe-muted opacity-30" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── RAISE ISSUE TAB ──────────────────────────────────────────────────────────
function RaiseIssueTab({ routes, reload, setTab }) {
  const [form, setForm] = useState({ route_id: '', issue_type: 'complaint', description: '' });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      await transportAPI.createIssue(form);
      setDone(true);
      await reload();
    } catch (e) { alert(e.response?.data?.error || 'Failed to submit'); }
    finally { setSaving(false); }
  };

  if (done) return (
    <div className="card p-8 text-center space-y-3">
      <CheckCircle2 size={40} className="mx-auto text-oe-success" />
      <p className="font-semibold text-oe-text">Issue Submitted</p>
      <p className="text-sm text-oe-muted">HR will review your issue shortly.</p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => { setDone(false); setForm({ route_id: '', issue_type: 'complaint', description: '' }); }} className="px-4 py-2 rounded-lg border border-oe-border text-oe-muted text-sm">Submit Another</button>
        <button onClick={() => setTab('History')} className="px-4 py-2 rounded-lg gradient-bg text-white text-sm">View History</button>
      </div>
    </div>
  );

  return (
    <div className="card p-5 space-y-4 max-w-lg">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={16} className="text-oe-primary" />
        <h3 className="font-semibold text-oe-text">Report an Issue</h3>
      </div>
      <Field label="Issue Type">
        <select className={inputCls} value={form.issue_type} onChange={e => setForm(p => ({ ...p, issue_type: e.target.value }))}>
          <option value="complaint">Complaint</option>
          <option value="feedback">Feedback</option>
          <option value="delay">Delay</option>
          <option value="missed_ride">Missed Ride</option>
        </select>
      </Field>
      <Field label="Related Route (optional)">
        <select className={inputCls} value={form.route_id} onChange={e => setForm(p => ({ ...p, route_id: e.target.value }))}>
          <option value="">Not route-specific</option>
          {routes.filter(r => r.is_active).map(r => <option key={r.id} value={r.id}>{r.route_name}</option>)}
        </select>
      </Field>
      <Field label="Description *">
        <textarea className={inputCls} rows={4} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe your issue or feedback…" />
      </Field>
      <button onClick={submit} disabled={saving || !form.description.trim()} className="w-full px-4 py-2.5 rounded-lg gradient-bg text-white text-sm font-medium disabled:opacity-50">
        {saving ? 'Submitting…' : 'Submit Issue'}
      </button>
    </div>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────────────────────
export default function TransportPage() {
  return (
    <PrivateRoute>
      <Layout>
        <TransportContent />
      </Layout>
    </PrivateRoute>
  );
}
