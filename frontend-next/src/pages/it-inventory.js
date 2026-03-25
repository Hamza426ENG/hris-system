import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/common/Toast';
import { itInventoryAPI, departmentsAPI } from '@/services/api';
import {
  Plus, Search, Monitor, Laptop, Smartphone, Tablet, Keyboard, Mouse,
  Headphones, HardDrive, CreditCard, Wifi, Printer, Package, X,
  ChevronLeft, ChevronRight, Loader2, Wrench, ClipboardList, BarChart3,
  CheckCircle2, AlertCircle, Clock, XCircle, ArrowUpDown, Download,
  RefreshCw, Eye, Edit3, Trash2, RotateCcw, UserPlus, UserMinus,
  Shield, AlertTriangle, Activity, FileText, Settings,
} from 'lucide-react';

// ── Category Icons ──────────────────────────────────────────────────────────

const CATEGORY_CFG = {
  laptop:           { icon: Laptop,      label: 'Laptop',           color: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' },
  desktop:          { icon: Monitor,     label: 'Desktop',          color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' },
  monitor:          { icon: Monitor,     label: 'Monitor',          color: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' },
  mobile_phone:     { icon: Smartphone,  label: 'Mobile Phone',     color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
  tablet:           { icon: Tablet,      label: 'Tablet',           color: 'text-teal-500 bg-teal-50 dark:bg-teal-500/10' },
  keyboard:         { icon: Keyboard,    label: 'Keyboard',         color: 'text-slate-500 bg-slate-50 dark:bg-slate-500/10' },
  mouse:            { icon: Mouse,       label: 'Mouse',            color: 'text-slate-400 bg-slate-50 dark:bg-slate-500/10' },
  headset:          { icon: Headphones,  label: 'Headset',          color: 'text-pink-500 bg-pink-50 dark:bg-pink-500/10' },
  docking_station:  { icon: HardDrive,   label: 'Docking Station',  color: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' },
  access_card:      { icon: CreditCard,  label: 'Access Card',      color: 'text-orange-500 bg-orange-50 dark:bg-orange-500/10' },
  networking_device:{ icon: Wifi,         label: 'Networking Device', color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10' },
  printer:          { icon: Printer,     label: 'Printer',          color: 'text-rose-500 bg-rose-50 dark:bg-rose-500/10' },
  other:            { icon: Package,     label: 'Other',            color: 'text-gray-500 bg-gray-50 dark:bg-gray-500/10' },
};

const CategoryIcon = ({ category, size = 14 }) => {
  const cfg = CATEGORY_CFG[category] || CATEGORY_CFG.other;
  const Icon = cfg.icon;
  return (
    <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
      <Icon size={size} />
    </div>
  );
};

// ── Status Config ───────────────────────────────────────────────────────────

const STATUS_CFG = {
  available: { label: 'Available', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30', icon: CheckCircle2 },
  assigned:  { label: 'Assigned',  cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30', icon: UserPlus },
  in_repair: { label: 'In Repair', cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30', icon: Wrench },
  reserved:  { label: 'Reserved',  cls: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30', icon: Clock },
  retired:   { label: 'Retired',   cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/30', icon: XCircle },
  lost:      { label: 'Lost',      cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30', icon: AlertTriangle },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CFG[status] || STATUS_CFG.available;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

const CONDITION_CFG = {
  new:  { label: 'New',  cls: 'text-emerald-600 dark:text-emerald-400' },
  good: { label: 'Good', cls: 'text-blue-600 dark:text-blue-400' },
  fair: { label: 'Fair', cls: 'text-amber-600 dark:text-amber-400' },
  poor: { label: 'Poor', cls: 'text-red-600 dark:text-red-400' },
};

const REPAIR_STATUS_CFG = {
  pending:     { label: 'Pending',     cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30' },
  in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30' },
  completed:   { label: 'Completed',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/30' },
};

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'assets',      label: 'Asset Registry',  icon: Monitor },
  { key: 'maintenance', label: 'Maintenance',      icon: Wrench },
  { key: 'audit',       label: 'Audit Log',        icon: ClipboardList },
  { key: 'dashboard',   label: 'Dashboard',         icon: BarChart3 },
];

// ── Empty Form States ────────────────────────────────────────────────────────

const EMPTY_ASSET = {
  name: '', category: 'laptop', brand: '', model: '', serial_number: '',
  purchase_date: '', purchase_cost: '', vendor_name: '', warranty_expiry: '',
  condition: 'new', location: '', department_id: '', notes: '',
};

const EMPTY_MAINTENANCE = {
  asset_id: '', type: 'repair', description: '',
  vendor_name: '', vendor_contact: '', vendor_reference: '', technician_name: '', notes: '',
};

// ═════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

export default function ITInventoryPage() {
  const { user } = useAuth();
  const { toast: _t } = useToast();
  const addToast = (msg, type = 'info') => _t[type] ? _t[type](msg) : _t.info(msg);
  const isAdmin = ['super_admin', 'hr_admin'].includes(user?.role);
  const isEmployee = user?.role === 'employee';

  const [activeTab, setActiveTab] = useState('assets');
  const [loading, setLoading] = useState(false);

  // ── Assets State ──────────────────────────────────────────────────────────
  const [assets, setAssets] = useState([]);
  const [assetsTotal, setAssetsTotal] = useState(0);
  const [assetsPage, setAssetsPage] = useState(1);
  const [assetsFilter, setAssetsFilter] = useState({ search: '', status: '', category: '', department_id: '' });
  const [assetModal, setAssetModal] = useState(null); // 'create' | 'edit' | 'view' | 'assign' | 'return'
  const [assetForm, setAssetForm] = useState({ ...EMPTY_ASSET });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [assignForm, setAssignForm] = useState({ employee_id: '', expected_return: '', notes: '' });
  const [returnForm, setReturnForm] = useState({ condition_on_return: 'good', notes: '' });

  // ── Maintenance State ─────────────────────────────────────────────────────
  const [maintenance, setMaintenance] = useState([]);
  const [maintFilter, setMaintFilter] = useState({ status: '', type: '' });
  const [maintModal, setMaintModal] = useState(null); // 'create' | 'edit'
  const [maintForm, setMaintForm] = useState({ ...EMPTY_MAINTENANCE });
  const [editMaintId, setEditMaintId] = useState(null);

  // ── Audit Log State ───────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);

  // ── Dashboard State ───────────────────────────────────────────────────────
  const [dashData, setDashData] = useState(null);

  // ── Shared ────────────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  // ── My Assets (Employee) ──────────────────────────────────────────────────
  const [myAssets, setMyAssets] = useState({ current: [], history: [] });

  // ── Load departments & employees on mount ─────────────────────────────────

  useEffect(() => {
    departmentsAPI.list().then(r => setDepartments(r.data || [])).catch(() => {});
    if (isAdmin) {
      itInventoryAPI.employees().then(r => setEmployees(r.data || [])).catch(() => {});
    }
  }, [isAdmin]);

  // ── Load assets ───────────────────────────────────────────────────────────

  const loadAssets = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (assetsFilter.search) params.search = assetsFilter.search;
      if (assetsFilter.status) params.status = assetsFilter.status;
      if (assetsFilter.category) params.category = assetsFilter.category;
      if (assetsFilter.department_id) params.department_id = assetsFilter.department_id;

      const res = await itInventoryAPI.listAssets(params);
      setAssets(res.data.assets || []);
      setAssetsTotal(res.data.total || 0);
      setAssetsPage(page);
    } catch {
      addToast('Failed to load assets', 'error');
    } finally {
      setLoading(false);
    }
  }, [assetsFilter, addToast]);

  // ── Load my assets (employee self-service) ────────────────────────────────

  const loadMyAssets = useCallback(async () => {
    try {
      const res = await itInventoryAPI.myAssets();
      setMyAssets(res.data || { current: [], history: [] });
    } catch {
      addToast('Failed to load your assets', 'error');
    }
  }, [addToast]);

  // ── Load maintenance ──────────────────────────────────────────────────────

  const loadMaintenance = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (maintFilter.status) params.status = maintFilter.status;
      if (maintFilter.type) params.type = maintFilter.type;

      const res = await itInventoryAPI.listMaintenance(params);
      setMaintenance(res.data || []);
    } catch {
      addToast('Failed to load maintenance requests', 'error');
    } finally {
      setLoading(false);
    }
  }, [maintFilter, addToast]);

  // ── Load audit log ────────────────────────────────────────────────────────

  const loadAuditLog = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await itInventoryAPI.auditLog({ page, limit: 30 });
      setAuditLogs(res.data.logs || []);
      setAuditTotal(res.data.total || 0);
      setAuditPage(page);
    } catch {
      addToast('Failed to load audit log', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // ── Load dashboard ────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await itInventoryAPI.dashboard();
      setDashData(res.data);
    } catch {
      addToast('Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // ── Tab-based data loading ────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === 'assets') {
      if (isEmployee) loadMyAssets();
      else loadAssets(1);
    }
    else if (activeTab === 'maintenance') loadMaintenance();
    else if (activeTab === 'audit' && isAdmin) loadAuditLog(1);
    else if (activeTab === 'dashboard') loadDashboard();
  }, [activeTab, isEmployee, isAdmin, loadAssets, loadMyAssets, loadMaintenance, loadAuditLog, loadDashboard]);

  // ── Reload when filters change ────────────────────────────────────────────

  useEffect(() => { if (activeTab === 'assets' && !isEmployee) loadAssets(1); }, [assetsFilter]);
  useEffect(() => { if (activeTab === 'maintenance') loadMaintenance(); }, [maintFilter]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ASSET HANDLERS ────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCreateAsset = async () => {
    try {
      if (!assetForm.name) return addToast('Asset name is required', 'error');
      await itInventoryAPI.createAsset(assetForm);
      addToast('Asset created successfully', 'success');
      setAssetModal(null);
      setAssetForm({ ...EMPTY_ASSET });
      loadAssets(1);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to create asset', 'error');
    }
  };

  const handleUpdateAsset = async () => {
    try {
      await itInventoryAPI.updateAsset(selectedAsset.id, assetForm);
      addToast('Asset updated successfully', 'success');
      setAssetModal(null);
      loadAssets(assetsPage);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update asset', 'error');
    }
  };

  const handleDeleteAsset = async (asset) => {
    if (!confirm(`Delete asset "${asset.name}" (${asset.asset_id})? This cannot be undone.`)) return;
    try {
      await itInventoryAPI.deleteAsset(asset.id);
      addToast('Asset deleted', 'success');
      loadAssets(assetsPage);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete asset', 'error');
    }
  };

  const handleAssignAsset = async () => {
    try {
      if (!assignForm.employee_id) return addToast('Select an employee', 'error');
      await itInventoryAPI.assignAsset(selectedAsset.id, assignForm);
      addToast('Asset assigned successfully', 'success');
      setAssetModal(null);
      setAssignForm({ employee_id: '', expected_return: '', notes: '' });
      loadAssets(assetsPage);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to assign asset', 'error');
    }
  };

  const handleReturnAsset = async () => {
    try {
      if (!returnForm.condition_on_return) return addToast('Condition is required', 'error');
      await itInventoryAPI.returnAsset(selectedAsset.id, returnForm);
      addToast('Asset returned successfully', 'success');
      setAssetModal(null);
      setReturnForm({ condition_on_return: 'good', notes: '' });
      loadAssets(assetsPage);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to return asset', 'error');
    }
  };

  const openViewAsset = async (asset) => {
    try {
      const res = await itInventoryAPI.getAsset(asset.id);
      setSelectedAsset(res.data);
      setAssetModal('view');
    } catch {
      addToast('Failed to load asset details', 'error');
    }
  };

  const openEditAsset = (asset) => {
    setSelectedAsset(asset);
    setAssetForm({
      name: asset.name || '', category: asset.category || 'other', brand: asset.brand || '',
      model: asset.model || '', serial_number: asset.serial_number || '',
      purchase_date: asset.purchase_date ? asset.purchase_date.split('T')[0] : '',
      purchase_cost: asset.purchase_cost || '', vendor_name: asset.vendor_name || '',
      warranty_expiry: asset.warranty_expiry ? asset.warranty_expiry.split('T')[0] : '',
      condition: asset.condition || 'new', location: asset.location || '',
      department_id: asset.department_id || '', notes: asset.notes || '',
    });
    setAssetModal('edit');
  };

  const openAssignAsset = (asset) => {
    setSelectedAsset(asset);
    setAssignForm({ employee_id: '', expected_return: '', notes: '' });
    setAssetModal('assign');
  };

  const openReturnAsset = (asset) => {
    setSelectedAsset(asset);
    setReturnForm({ condition_on_return: 'good', notes: '' });
    setAssetModal('return');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ── MAINTENANCE HANDLERS ──────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCreateMaintenance = async () => {
    try {
      if (!maintForm.asset_id || !maintForm.description) return addToast('Asset and description are required', 'error');
      await itInventoryAPI.createMaintenance(maintForm);
      addToast('Maintenance request created', 'success');
      setMaintModal(null);
      setMaintForm({ ...EMPTY_MAINTENANCE });
      loadMaintenance();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to create maintenance request', 'error');
    }
  };

  const handleUpdateMaintenance = async () => {
    try {
      await itInventoryAPI.updateMaintenance(editMaintId, maintForm);
      addToast('Maintenance request updated', 'success');
      setMaintModal(null);
      setEditMaintId(null);
      loadMaintenance();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update maintenance request', 'error');
    }
  };

  const openEditMaint = (m) => {
    setEditMaintId(m.id);
    setMaintForm({
      status: m.status || '', type: m.type || 'repair', description: m.description || '',
      vendor_name: m.vendor_name || '', vendor_contact: m.vendor_contact || '',
      vendor_reference: m.vendor_reference || '', technician_name: m.technician_name || '',
      repair_cost: m.repair_cost || '', condition_after: m.condition_after || 'good', notes: m.notes || '',
    });
    setMaintModal('edit');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ── CSV EXPORT ────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const exportCSV = (rows, filename) => {
    if (!rows.length) return addToast('No data to export', 'error');
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER ────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const totalPages = Math.ceil(assetsTotal / 25);
  const auditTotalPages = Math.ceil(auditTotal / 30);

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">IT Inventory</h1>
          <p className="text-sm text-slate-500 dark:text-white/50 mt-1">Manage IT assets, assignments, maintenance, and reports</p>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-lg w-fit">
        {TABS.filter(t => {
          if (t.key === 'audit' && !isAdmin) return false;
          if (t.key === 'dashboard' && isEmployee) return false;
          return true;
        }).map(t => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                active
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70'
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Loading Overlay ──────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      )}

      {/* ── Tab Content ──────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'assets' && (isEmployee ? renderMyAssets() : renderAssets())}
      {!loading && activeTab === 'maintenance' && renderMaintenance()}
      {!loading && activeTab === 'audit' && isAdmin && renderAuditLog()}
      {!loading && activeTab === 'dashboard' && renderDashboard()}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {assetModal === 'create' && renderAssetFormModal('Create New Asset', handleCreateAsset)}
      {assetModal === 'edit' && renderAssetFormModal('Edit Asset', handleUpdateAsset)}
      {assetModal === 'view' && selectedAsset && renderViewAssetModal()}
      {assetModal === 'assign' && selectedAsset && renderAssignModal()}
      {assetModal === 'return' && selectedAsset && renderReturnModal()}
      {maintModal === 'create' && renderMaintFormModal('New Maintenance Request', handleCreateMaintenance)}
      {maintModal === 'edit' && renderMaintFormModal('Update Maintenance Request', handleUpdateMaintenance)}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ── EMPLOYEE MY-ASSETS VIEW ───────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderMyAssets() {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">My Current Equipment</h2>
          {myAssets.current.length === 0 ? (
            <p className="text-slate-400 dark:text-white/30 text-sm">No assets currently assigned to you.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myAssets.current.map(a => (
                <div key={a.id} className="border border-slate-200 dark:border-white/10 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <CategoryIcon category={a.category} />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white text-sm">{a.name}</div>
                      <div className="text-xs text-slate-400 dark:text-white/40">{a.asset_id}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-white/50 space-y-1">
                    {a.brand && <div><span className="font-medium">Brand:</span> {a.brand} {a.model}</div>}
                    {a.serial_number && <div><span className="font-medium">S/N:</span> {a.serial_number}</div>}
                    {a.assigned_date && <div><span className="font-medium">Assigned:</span> {new Date(a.assigned_date).toLocaleDateString()}</div>}
                  </div>
                  <button
                    onClick={() => {
                      setMaintForm({ ...EMPTY_MAINTENANCE, asset_id: a.id, description: '' });
                      setMaintModal('create');
                    }}
                    className="w-full mt-2 px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/20 transition-colors"
                  >
                    Report an Issue
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {myAssets.history.length > 0 && (
          <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Asset History</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Asset</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Action</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {myAssets.history.map(h => (
                    <tr key={h.id} className="border-b border-slate-100 dark:border-white/5">
                      <td className="py-2 px-3 text-slate-700 dark:text-white/70">{h.asset_name} ({h.asset_id})</td>
                      <td className="py-2 px-3 capitalize text-slate-600 dark:text-white/60">{h.action}</td>
                      <td className="py-2 px-3 text-slate-500 dark:text-white/50">
                        {h.action === 'assigned' ? (h.assigned_date && new Date(h.assigned_date).toLocaleDateString()) : (h.returned_date && new Date(h.returned_date).toLocaleDateString())}
                      </td>
                      <td className="py-2 px-3">
                        {h.condition_on_return && <span className={CONDITION_CFG[h.condition_on_return]?.cls || ''}>{CONDITION_CFG[h.condition_on_return]?.label || h.condition_on_return}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ASSET REGISTRY TAB ────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderAssets() {
    return (
      <div className="space-y-4">
        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={assetsFilter.search}
              onChange={e => setAssetsFilter(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-700 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={assetsFilter.status}
            onChange={e => setAssetsFilter(f => ({ ...f, status: e.target.value }))}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-700 dark:text-white"
          >
            <option value="">All Status</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select
            value={assetsFilter.category}
            onChange={e => setAssetsFilter(f => ({ ...f, category: e.target.value }))}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-700 dark:text-white"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select
            value={assetsFilter.department_id}
            onChange={e => setAssetsFilter(f => ({ ...f, department_id: e.target.value }))}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-700 dark:text-white"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => exportCSV(assets, 'it-assets')} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors" title="Export CSV">
              <Download size={16} />
            </button>
            <button onClick={() => loadAssets(assetsPage)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors" title="Refresh">
              <RefreshCw size={16} />
            </button>
            {isAdmin && (
              <button
                onClick={() => { setAssetForm({ ...EMPTY_ASSET }); setAssetModal('create'); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                Add Asset
              </button>
            )}
          </div>
        </div>

        {/* Assets Table */}
        <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Asset</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Category</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden lg:table-cell">Brand / Model</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden md:table-cell">Condition</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden lg:table-cell">Assigned To</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden xl:table-cell">Location</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-slate-400 dark:text-white/30">No assets found</td></tr>
                ) : assets.map(a => (
                  <tr key={a.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/3 transition-colors cursor-pointer" onClick={() => openViewAsset(a)}>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">{a.name}</div>
                      <div className="text-xs text-slate-400 dark:text-white/40">{a.asset_id}{a.serial_number ? ` · S/N: ${a.serial_number}` : ''}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <CategoryIcon category={a.category} size={12} />
                        <span className="text-slate-600 dark:text-white/60 text-xs">{CATEGORY_CFG[a.category]?.label || a.category}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-slate-600 dark:text-white/60">{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="py-3 px-4"><StatusBadge status={a.status} /></td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span className={`text-xs font-medium ${CONDITION_CFG[a.condition]?.cls || ''}`}>{CONDITION_CFG[a.condition]?.label || a.condition}</span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-slate-600 dark:text-white/60">{a.assigned_to_name || '—'}</td>
                    <td className="py-3 px-4 hidden xl:table-cell text-slate-500 dark:text-white/50 text-xs">{a.location || '—'}</td>
                    <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && a.status === 'available' && (
                          <button onClick={() => openAssignAsset(a)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors" title="Assign">
                            <UserPlus size={14} />
                          </button>
                        )}
                        {isAdmin && a.status === 'assigned' && (
                          <button onClick={() => openReturnAsset(a)} className="p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded transition-colors" title="Return">
                            <UserMinus size={14} />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => openEditAsset(a)} className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 rounded transition-colors" title="Edit">
                            <Edit3 size={14} />
                          </button>
                        )}
                        {user?.role === 'super_admin' && (
                          <button onClick={() => handleDeleteAsset(a)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/10">
              <div className="text-xs text-slate-500 dark:text-white/40">
                Showing {(assetsPage - 1) * 25 + 1}–{Math.min(assetsPage * 25, assetsTotal)} of {assetsTotal}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => loadAssets(assetsPage - 1)} disabled={assetsPage === 1} className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-slate-600 dark:text-white/60 px-2">{assetsPage} / {totalPages}</span>
                <button onClick={() => loadAssets(assetsPage + 1)} disabled={assetsPage >= totalPages} className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── MAINTENANCE TAB ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderMaintenance() {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            value={maintFilter.status}
            onChange={e => setMaintFilter(f => ({ ...f, status: e.target.value }))}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-700 dark:text-white"
          >
            <option value="">All Status</option>
            {Object.entries(REPAIR_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select
            value={maintFilter.type}
            onChange={e => setMaintFilter(f => ({ ...f, type: e.target.value }))}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-700 dark:text-white"
          >
            <option value="">All Types</option>
            <option value="repair">Repair</option>
            <option value="upgrade">Upgrade</option>
            <option value="inspection">Inspection</option>
            <option value="cleaning">Cleaning</option>
          </select>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => exportCSV(maintenance, 'maintenance-requests')} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors" title="Export CSV">
              <Download size={16} />
            </button>
            <button
              onClick={() => { setMaintForm({ ...EMPTY_MAINTENANCE }); setMaintModal('create'); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} />
              New Request
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Asset</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Description</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden md:table-cell">Vendor / Tech</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden lg:table-cell">Cost</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden lg:table-cell">Date</th>
                  {isAdmin && <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {maintenance.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-slate-400 dark:text-white/30">No maintenance requests found</td></tr>
                ) : maintenance.map(m => (
                  <tr key={m.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white text-xs">{m.asset_name}</div>
                      <div className="text-xs text-slate-400 dark:text-white/40">{m.asset_code}</div>
                    </td>
                    <td className="py-3 px-4 capitalize text-slate-600 dark:text-white/60 text-xs">{m.type}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-white/60 text-xs max-w-[200px] truncate">{m.description}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${REPAIR_STATUS_CFG[m.status]?.cls || ''}`}>
                        {REPAIR_STATUS_CFG[m.status]?.label || m.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-slate-500 dark:text-white/50 text-xs">{m.vendor_name || m.technician_name || '—'}</td>
                    <td className="py-3 px-4 hidden lg:table-cell text-slate-500 dark:text-white/50 text-xs">{m.repair_cost ? `$${parseFloat(m.repair_cost).toLocaleString()}` : '—'}</td>
                    <td className="py-3 px-4 hidden lg:table-cell text-slate-500 dark:text-white/50 text-xs">{new Date(m.created_at).toLocaleDateString()}</td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => openEditMaint(m)} className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 rounded transition-colors" title="Edit">
                          <Edit3 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── AUDIT LOG TAB ─────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderAuditLog() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Asset Audit Trail</h2>
          <button onClick={() => exportCSV(auditLogs, 'audit-log')} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors" title="Export CSV">
            <Download size={16} />
          </button>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Timestamp</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Asset</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase">Action</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden md:table-cell">Performed By</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden lg:table-cell">Affected Employee</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 uppercase hidden xl:table-cell">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400 dark:text-white/30">No audit log entries</td></tr>
                ) : auditLogs.map(l => (
                  <tr key={l.id} className="border-b border-slate-100 dark:border-white/5">
                    <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-white/50 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 dark:text-white/70">{l.asset_name ? `${l.asset_name} (${l.asset_code})` : l.asset_code || '—'}</td>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60">
                        {l.action?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 hidden md:table-cell text-xs text-slate-500 dark:text-white/50">{l.performed_by_email || '—'}</td>
                    <td className="py-2.5 px-4 hidden lg:table-cell text-xs text-slate-500 dark:text-white/50">{l.affected_employee_name || '—'}</td>
                    <td className="py-2.5 px-4 hidden xl:table-cell text-xs text-slate-400 dark:text-white/40 max-w-[200px] truncate">{l.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {auditTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/10">
              <div className="text-xs text-slate-500 dark:text-white/40">Page {auditPage} of {auditTotalPages}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => loadAuditLog(auditPage - 1)} disabled={auditPage === 1} className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => loadAuditLog(auditPage + 1)} disabled={auditPage >= auditTotalPages} className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── DASHBOARD TAB ─────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderDashboard() {
    if (!dashData) return null;
    const sb = dashData.status_breakdown || {};
    const cb = dashData.category_breakdown || [];

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DashCard label="Total Assets" value={dashData.total_assets} icon={Monitor} color="blue" />
          <DashCard label="Total Value" value={`$${(dashData.total_value || 0).toLocaleString()}`} icon={Package} color="emerald" />
          <DashCard label="Active Repairs" value={dashData.active_repairs} icon={Wrench} color="amber" />
          <DashCard label="Warranty Expiring" value={dashData.warranty_expiring_soon} icon={AlertTriangle} color="red" />
        </div>

        {/* Status Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Status Breakdown</h3>
            <div className="space-y-3">
              {Object.entries(STATUS_CFG).map(([key, cfg]) => {
                const count = sb[key] || 0;
                const pct = dashData.total_assets > 0 ? (count / dashData.total_assets * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-24 text-xs font-medium text-slate-600 dark:text-white/60">{cfg.label}</div>
                    <div className="flex-1 bg-slate-100 dark:bg-white/5 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-10 text-xs text-right text-slate-500 dark:text-white/50">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Category Breakdown</h3>
            <div className="space-y-2.5">
              {cb.map(c => (
                <div key={c.category} className="flex items-center gap-3">
                  <CategoryIcon category={c.category} size={12} />
                  <div className="flex-1 text-xs text-slate-600 dark:text-white/60">{CATEGORY_CFG[c.category]?.label || c.category}</div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-white/70">{c.count}</div>
                </div>
              ))}
              {cb.length === 0 && <p className="text-xs text-slate-400 dark:text-white/30">No data</p>}
            </div>
          </div>
        </div>

        {/* Cost Summary */}
        <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Repair Costs</h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">${(dashData.total_repair_cost || 0).toLocaleString()}</p>
          <p className="text-xs text-slate-400 dark:text-white/40 mt-1">Total maintenance spend across all completed repairs</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ASSET FORM MODAL ──────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderAssetFormModal(title, onSave) {
    return (
      <Modal title={title} onClose={() => setAssetModal(null)} wide>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Asset Name *" value={assetForm.name} onChange={v => setAssetForm(f => ({ ...f, name: v }))} />
          <FormSelect label="Category" value={assetForm.category} onChange={v => setAssetForm(f => ({ ...f, category: v }))} options={Object.entries(CATEGORY_CFG).map(([k, v]) => ({ value: k, label: v.label }))} />
          <FormField label="Brand" value={assetForm.brand} onChange={v => setAssetForm(f => ({ ...f, brand: v }))} />
          <FormField label="Model" value={assetForm.model} onChange={v => setAssetForm(f => ({ ...f, model: v }))} />
          <FormField label="Serial Number" value={assetForm.serial_number} onChange={v => setAssetForm(f => ({ ...f, serial_number: v }))} />
          <FormField label="Purchase Date" type="date" value={assetForm.purchase_date} onChange={v => setAssetForm(f => ({ ...f, purchase_date: v }))} />
          <FormField label="Purchase Cost" type="number" value={assetForm.purchase_cost} onChange={v => setAssetForm(f => ({ ...f, purchase_cost: v }))} />
          <FormField label="Vendor Name" value={assetForm.vendor_name} onChange={v => setAssetForm(f => ({ ...f, vendor_name: v }))} />
          <FormField label="Warranty Expiry" type="date" value={assetForm.warranty_expiry} onChange={v => setAssetForm(f => ({ ...f, warranty_expiry: v }))} />
          <FormSelect label="Condition" value={assetForm.condition} onChange={v => setAssetForm(f => ({ ...f, condition: v }))} options={Object.entries(CONDITION_CFG).map(([k, v]) => ({ value: k, label: v.label }))} />
          <FormField label="Location" value={assetForm.location} onChange={v => setAssetForm(f => ({ ...f, location: v }))} />
          <FormSelect label="Department" value={assetForm.department_id} onChange={v => setAssetForm(f => ({ ...f, department_id: v }))} options={[{ value: '', label: 'None' }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />
          <div className="md:col-span-2">
            <FormField label="Notes" value={assetForm.notes} onChange={v => setAssetForm(f => ({ ...f, notes: v }))} textarea />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
          <button onClick={() => setAssetModal(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Save</button>
        </div>
      </Modal>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── VIEW ASSET MODAL ──────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderViewAssetModal() {
    const a = selectedAsset;
    return (
      <Modal title={`${a.name} — ${a.asset_id}`} onClose={() => setAssetModal(null)} wide>
        <div className="space-y-6">
          {/* Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <Detail label="Category" value={CATEGORY_CFG[a.category]?.label || a.category} />
            <Detail label="Brand" value={a.brand} />
            <Detail label="Model" value={a.model} />
            <Detail label="Serial Number" value={a.serial_number} />
            <Detail label="Status"><StatusBadge status={a.status} /></Detail>
            <Detail label="Condition"><span className={CONDITION_CFG[a.condition]?.cls}>{CONDITION_CFG[a.condition]?.label || a.condition}</span></Detail>
            <Detail label="Location" value={a.location} />
            <Detail label="Department" value={a.department_name} />
            <Detail label="Purchase Date" value={a.purchase_date ? new Date(a.purchase_date).toLocaleDateString() : null} />
            <Detail label="Purchase Cost" value={a.purchase_cost ? `$${parseFloat(a.purchase_cost).toLocaleString()}` : null} />
            <Detail label="Vendor" value={a.vendor_name} />
            <Detail label="Warranty Expiry" value={a.warranty_expiry ? new Date(a.warranty_expiry).toLocaleDateString() : null} />
            {a.assigned_to_name && <Detail label="Assigned To" value={`${a.assigned_to_name} (${a.assigned_to_code})`} />}
            {a.assigned_date && <Detail label="Assigned Date" value={new Date(a.assigned_date).toLocaleDateString()} />}
          </div>
          {a.notes && <div className="text-sm text-slate-500 dark:text-white/50"><span className="font-medium text-slate-700 dark:text-white/70">Notes:</span> {a.notes}</div>}

          {/* Assignment History */}
          {a.assignment_history?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Assignment History</h4>
              <div className="space-y-2">
                {a.assignment_history.map(h => (
                  <div key={h.id} className="flex items-center gap-3 text-xs p-2 bg-slate-50 dark:bg-white/5 rounded-lg">
                    <span className={`font-semibold uppercase ${h.action === 'assigned' ? 'text-blue-600' : 'text-amber-600'}`}>{h.action}</span>
                    <span className="text-slate-600 dark:text-white/60">{h.employee_name}</span>
                    <span className="text-slate-400 dark:text-white/40 ml-auto">
                      {h.action === 'assigned' ? (h.assigned_date && new Date(h.assigned_date).toLocaleDateString()) : (h.returned_date && new Date(h.returned_date).toLocaleDateString())}
                    </span>
                    {h.condition_on_return && <span className={CONDITION_CFG[h.condition_on_return]?.cls}>{CONDITION_CFG[h.condition_on_return]?.label}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Maintenance History */}
          {a.maintenance_history?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Maintenance History</h4>
              <div className="space-y-2">
                {a.maintenance_history.map(m => (
                  <div key={m.id} className="flex items-center gap-3 text-xs p-2 bg-slate-50 dark:bg-white/5 rounded-lg">
                    <span className="capitalize font-medium text-slate-700 dark:text-white/70">{m.type}</span>
                    <span className="text-slate-500 dark:text-white/50 truncate flex-1">{m.description}</span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase border ${REPAIR_STATUS_CFG[m.status]?.cls || ''}`}>{REPAIR_STATUS_CFG[m.status]?.label || m.status}</span>
                    {m.repair_cost && <span className="text-slate-600 dark:text-white/60">${parseFloat(m.repair_cost).toLocaleString()}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit Trail */}
          {a.audit_trail?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Audit Trail</h4>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {a.audit_trail.map(l => (
                  <div key={l.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-100 dark:border-white/5">
                    <span className="text-slate-400 dark:text-white/30 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</span>
                    <span className="font-semibold text-slate-600 dark:text-white/60 uppercase">{l.action?.replace(/_/g, ' ')}</span>
                    <span className="text-slate-400 dark:text-white/40 truncate">{l.details}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ASSIGN MODAL ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderAssignModal() {
    return (
      <Modal title={`Assign — ${selectedAsset.name} (${selectedAsset.asset_id})`} onClose={() => setAssetModal(null)}>
        <div className="space-y-4">
          <FormSelect
            label="Employee *"
            value={assignForm.employee_id}
            onChange={v => setAssignForm(f => ({ ...f, employee_id: v }))}
            options={[{ value: '', label: 'Select employee...' }, ...employees.map(e => ({ value: e.id, label: `${e.first_name} ${e.last_name} (${e.employee_code})` }))]}
          />
          <FormField label="Expected Return Date (optional)" type="date" value={assignForm.expected_return} onChange={v => setAssignForm(f => ({ ...f, expected_return: v }))} />
          <FormField label="Notes" value={assignForm.notes} onChange={v => setAssignForm(f => ({ ...f, notes: v }))} textarea />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
          <button onClick={() => setAssetModal(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleAssignAsset} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Assign Asset</button>
        </div>
      </Modal>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RETURN MODAL ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderReturnModal() {
    return (
      <Modal title={`Return — ${selectedAsset.name} (${selectedAsset.asset_id})`} onClose={() => setAssetModal(null)}>
        <div className="space-y-4">
          {selectedAsset.assigned_to_name && (
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg text-sm text-blue-700 dark:text-blue-300">
              Currently assigned to: <strong>{selectedAsset.assigned_to_name}</strong>
            </div>
          )}
          <FormSelect
            label="Condition on Return *"
            value={returnForm.condition_on_return}
            onChange={v => setReturnForm(f => ({ ...f, condition_on_return: v }))}
            options={Object.entries(CONDITION_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <FormField label="Notes" value={returnForm.notes} onChange={v => setReturnForm(f => ({ ...f, notes: v }))} textarea />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
          <button onClick={() => setAssetModal(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleReturnAsset} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors">Confirm Return</button>
        </div>
      </Modal>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── MAINTENANCE FORM MODAL ────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function renderMaintFormModal(title, onSave) {
    const isEdit = maintModal === 'edit';
    return (
      <Modal title={title} onClose={() => { setMaintModal(null); setEditMaintId(null); }} wide>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isEdit && (
            <FormSelect
              label="Asset *"
              value={maintForm.asset_id}
              onChange={v => setMaintForm(f => ({ ...f, asset_id: v }))}
              options={[{ value: '', label: 'Select asset...' }, ...assets.map(a => ({ value: a.id, label: `${a.name} (${a.asset_id})` }))]}
            />
          )}
          <FormSelect label="Type" value={maintForm.type} onChange={v => setMaintForm(f => ({ ...f, type: v }))} options={[{ value: 'repair', label: 'Repair' }, { value: 'upgrade', label: 'Upgrade' }, { value: 'inspection', label: 'Inspection' }, { value: 'cleaning', label: 'Cleaning' }]} />
          {isEdit && (
            <FormSelect label="Status" value={maintForm.status} onChange={v => setMaintForm(f => ({ ...f, status: v }))} options={Object.entries(REPAIR_STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))} />
          )}
          <FormField label="Vendor Name" value={maintForm.vendor_name} onChange={v => setMaintForm(f => ({ ...f, vendor_name: v }))} />
          <FormField label="Vendor Contact" value={maintForm.vendor_contact} onChange={v => setMaintForm(f => ({ ...f, vendor_contact: v }))} />
          <FormField label="Vendor Reference" value={maintForm.vendor_reference} onChange={v => setMaintForm(f => ({ ...f, vendor_reference: v }))} />
          <FormField label="Technician Name" value={maintForm.technician_name} onChange={v => setMaintForm(f => ({ ...f, technician_name: v }))} />
          {isEdit && (
            <>
              <FormField label="Repair Cost" type="number" value={maintForm.repair_cost} onChange={v => setMaintForm(f => ({ ...f, repair_cost: v }))} />
              <FormSelect label="Condition After" value={maintForm.condition_after} onChange={v => setMaintForm(f => ({ ...f, condition_after: v }))} options={Object.entries(CONDITION_CFG).map(([k, v]) => ({ value: k, label: v.label }))} />
            </>
          )}
          <div className="md:col-span-2">
            <FormField label="Description *" value={maintForm.description} onChange={v => setMaintForm(f => ({ ...f, description: v }))} textarea />
          </div>
          <div className="md:col-span-2">
            <FormField label="Notes" value={maintForm.notes} onChange={v => setMaintForm(f => ({ ...f, notes: v }))} textarea />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
          <button onClick={() => { setMaintModal(null); setEditMaintId(null); }} className="px-4 py-2 text-sm text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors">Save</button>
        </div>
      </Modal>
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ── REUSABLE UI COMPONENTS ──────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white dark:bg-[#1a1b23] rounded-xl shadow-2xl border border-slate-200 dark:border-white/10 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10 sticky top-0 bg-white dark:bg-[#1a1b23] z-10">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text', textarea }) {
  const cls = "w-full px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-700 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-white/50 mb-1.5">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className={cls} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}

function FormSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-white/50 mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Detail({ label, value, children }) {
  return (
    <div>
      <div className="text-xs text-slate-400 dark:text-white/40 mb-0.5">{label}</div>
      <div className="text-sm text-slate-700 dark:text-white/70">{children || value || '—'}</div>
    </div>
  );
}

function DashCard({ label, value, icon: Icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  };
  return (
    <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={18} />
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-white/40">{label}</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">{value}</div>
        </div>
      </div>
    </div>
  );
}
