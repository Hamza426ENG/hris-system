import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { organogramAPI, departmentsAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import {
  Search, ZoomIn, ZoomOut, Maximize2, ChevronDown, ChevronUp,
  Users, Building2, GitBranch, User, X,
} from 'lucide-react';
import Avatar from '@/components/common/Avatar';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

// ── Level visual config ───────────────────────────────────────────────────────
const LEVEL_CFG = [
  { ring: 'ring-amber-400',   lineColor: '#f59e0b', textCls: 'text-amber-400',   bgCls: 'bg-amber-400/10',   borderStyle: '2px solid rgba(251,191,36,0.5)',  glowColor: 'rgba(245,158,11,0.25)',  label: 'Executive'  },
  { ring: 'ring-blue-400',    lineColor: '#60a5fa', textCls: 'text-blue-400',    bgCls: 'bg-blue-400/10',    borderStyle: '2px solid rgba(96,165,250,0.5)',  glowColor: 'rgba(59,130,246,0.2)',   label: 'Director'   },
  { ring: 'ring-violet-400',  lineColor: '#a78bfa', textCls: 'text-violet-400',  bgCls: 'bg-violet-400/10',  borderStyle: '2px solid rgba(167,139,250,0.5)', glowColor: 'rgba(139,92,246,0.18)',  label: 'Manager'    },
  { ring: 'ring-cyan-400',    lineColor: '#22d3ee', textCls: 'text-cyan-400',    bgCls: 'bg-cyan-400/10',    borderStyle: '2px solid rgba(34,211,238,0.5)',  glowColor: 'rgba(6,182,212,0.15)',   label: 'Senior'     },
  { ring: 'ring-emerald-400', lineColor: '#34d399', textCls: 'text-emerald-400', bgCls: 'bg-emerald-400/10', borderStyle: '2px solid rgba(52,211,153,0.45)', glowColor: 'rgba(16,185,129,0.12)',  label: 'Staff'      },
];
const getLvl = (lvl) => LEVEL_CFG[Math.min(lvl, LEVEL_CFG.length - 1)];

// ── Connector line colours ────────────────────────────────────────────────────
const LINE_GRAD = [
  'linear-gradient(to bottom, #f59e0b, #60a5fa)',
  'linear-gradient(to bottom, #60a5fa, #a78bfa)',
  'linear-gradient(to bottom, #a78bfa, #22d3ee)',
  'linear-gradient(to bottom, #22d3ee, #34d399)',
  'linear-gradient(to bottom, #34d399, #34d399)',
];
const getLineGrad = (lvl) => LINE_GRAD[Math.min(lvl, LINE_GRAD.length - 1)];

// ── Count total descendants ───────────────────────────────────────────────────
function countDescendants(node) {
  return (node.children || []).reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

// ── TreeNode component ────────────────────────────────────────────────────────
function TreeNode({ node, level, currentEmpId, forceExpanded, onNavigate, search }) {
  const cfg = getLvl(level);
  const hasChildren = (node.children || []).length > 0;
  const isMe = node.id === currentEmpId;
  const isMatched = Boolean(search && node._matched);

  // Default: expand first 2 levels, collapse deeper
  const [collapsed, setCollapsed] = useState(level >= 2);
  const isExpanded = forceExpanded ? true : !collapsed;

  const directReports = (node.children || []).length;
  const totalReports  = countDescendants(node);

  const lineGrad = getLineGrad(level);
  const childCfg = getLvl(level + 1);

  return (
    <div className="flex flex-col items-center" style={{ minWidth: 0 }}>

      {/* ── Card ── */}
      <div
        className="relative flex flex-col items-center cursor-pointer group select-none"
        style={{ width: 176 }}
        onClick={(e) => { e.stopPropagation(); onNavigate(`/employees/${node.id}`); }}
      >
        {/* Glow behind card */}
        <div
          className="absolute inset-0 rounded-2xl blur-md transition-opacity duration-300 opacity-0 group-hover:opacity-100"
          style={{ background: cfg.glowColor }}
        />

        {/* Card body */}
        <div
          className={`relative w-full rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-sm text-center py-4 px-3 transition-all duration-200 group-hover:scale-[1.03] group-hover:-translate-y-0.5 ${
            isMatched ? 'ring-2 ring-offset-2 ring-offset-transparent ring-oe-primary dark:ring-offset-slate-950' : ''
          }`}
          style={{
            border: isMe
              ? '2px solid rgba(99,102,241,0.8)'
              : cfg.borderStyle,
            boxShadow: isMe
              ? '0 0 0 3px rgba(99,102,241,0.18), 0 8px 24px rgba(0,0,0,0.18)'
              : `0 4px 16px rgba(0,0,0,0.12)`,
          }}
        >
          {/* "YOU" badge */}
          {isMe && (
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shadow">
              You
            </div>
          )}

          {/* Level badge top-right */}
          <div
            className={`absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${cfg.bgCls} ${cfg.textCls}`}
            style={{ lineHeight: 1.4 }}
          >
            {cfg.label}
          </div>

          {/* Avatar */}
          <div className={`mx-auto mb-3 ring-2 ${cfg.ring} rounded-full ring-offset-2 dark:ring-offset-slate-900 overflow-hidden flex-shrink-0`}
            style={{ width: 52, height: 52 }}>
            <Avatar src={node.avatar_url} firstName={node.first_name} lastName={node.last_name} size={52} />
          </div>

          {/* Name */}
          <div className="text-[13px] font-bold text-oe-text leading-snug truncate px-1">
            {node.first_name} {node.last_name}
          </div>

          {/* Title */}
          <div className={`text-[11px] font-semibold mt-0.5 truncate px-1 ${cfg.textCls}`}>
            {node.position_title || 'No title'}
          </div>

          {/* Department */}
          <div className="flex items-center justify-center gap-1 mt-1">
            <Building2 size={9} className="text-oe-muted/60 flex-shrink-0" />
            <span className="text-[10px] text-oe-muted truncate">{node.department_name || '—'}</span>
          </div>

          {/* Reports count */}
          {hasChildren && (
            <div
              className={`mt-2.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bgCls} ${cfg.textCls}`}
            >
              <Users size={9} />
              {directReports} direct · {totalReports} total
            </div>
          )}
        </div>

        {/* Expand / Collapse toggle (only when has children and not force-expanded) */}
        {hasChildren && !forceExpanded && (
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c); }}
            className={`relative z-10 mt-2 flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-all duration-150 ${cfg.bgCls} ${cfg.textCls} hover:opacity-80`}
            style={{ borderColor: 'currentColor', opacity: 0.7 }}
          >
            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {isExpanded ? 'Collapse' : `Expand (${directReports})`}
          </button>
        )}
      </div>

      {/* ── Children tree ── */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col items-center w-full">
          {/* Vertical stem from card to horizontal bar */}
          <div style={{ width: 2, height: 32, background: lineGrad, borderRadius: 1, flexShrink: 0 }} />

          {/* Children row */}
          <div className="relative flex justify-center" style={{ gap: 24 }}>

            {/* Horizontal connector bar */}
            {node.children.length > 1 && (
              <div
                className="absolute"
                style={{
                  top: 0,
                  height: 2,
                  borderRadius: 1,
                  background: `linear-gradient(to right, ${cfg.lineColor}, ${childCfg.lineColor})`,
                  left:  `calc(${100 / node.children.length / 2}%)`,
                  right: `calc(${100 / node.children.length / 2}%)`,
                }}
              />
            )}

            {/* Each child column */}
            {node.children.map(child => (
              <div key={child.id} className="flex flex-col items-center" style={{ minWidth: 0 }}>
                {/* Vertical drop from horizontal bar to child card */}
                <div style={{ width: 2, height: 32, background: lineGrad, borderRadius: 1, flexShrink: 0 }} />
                <TreeNode
                  node={child}
                  level={level + 1}
                  currentEmpId={currentEmpId}
                  forceExpanded={forceExpanded}
                  onNavigate={onNavigate}
                  search={search}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter helpers ────────────────────────────────────────────────────────────
function filterTree(nodes, q) {
  if (!q) return nodes;
  const ql = q.toLowerCase();
  return nodes.reduce((acc, node) => {
    const match = `${node.first_name} ${node.last_name} ${node.position_title || ''} ${node.department_name || ''}`
      .toLowerCase().includes(ql);
    const children = filterTree(node.children || [], q);
    if (match || children.length > 0) acc.push({ ...node, children, _matched: match });
    return acc;
  }, []);
}

function filterByDept(nodes, deptId) {
  if (!deptId) return nodes;
  return nodes.reduce((acc, node) => {
    const children = filterByDept(node.children || [], deptId);
    if (node.department_id === deptId || children.length > 0) acc.push({ ...node, children });
    return acc;
  }, []);
}

function countTotal(nodes) {
  return nodes.reduce((sum, n) => sum + 1 + countTotal(n.children || []), 0);
}

// ── Main page ─────────────────────────────────────────────────────────────────
function OrganogramContent() {
  const { user } = useAuth();
  const router   = useRouter();

  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [zoom, setZoom]           = useState(0.85);
  const [departments, setDepts]   = useState([]);
  const [deptFilter, setDeptFilter] = useState('');
  const [expandAll, setExpandAll] = useState(false);
  const canvasRef = useRef(null);

  // Pan state
  const panning   = useRef(false);
  const panStart  = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const isFullAccess = ['super_admin', 'hr_admin'].includes(user?.role);

  useEffect(() => {
    Promise.all([
      organogramAPI.get(),
      departmentsAPI.list().catch(() => ({ data: [] })),
    ]).then(([orgRes, deptRes]) => {
      setData(orgRes.data);
      setDepts(Array.isArray(deptRes.data) ? deptRes.data : []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Keyboard zoom
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(1))); }
        if (e.key === '-')                  { e.preventDefault(); setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1))); }
        if (e.key === '0')                  { e.preventDefault(); resetView(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const resetView = useCallback(() => {
    setZoom(0.85);
    setPan({ x: 0, y: 0 });
    panOffset.current = { x: 0, y: 0 };
  }, []);

  // Pan handlers
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    panning.current = true;
    panStart.current = { x: e.clientX - panOffset.current.x, y: e.clientY - panOffset.current.y };
  };
  const onMouseMove = useCallback((e) => {
    if (!panning.current) return;
    const nx = e.clientX - panStart.current.x;
    const ny = e.clientY - panStart.current.y;
    panOffset.current = { x: nx, y: ny };
    setPan({ x: nx, y: ny });
  }, []);
  const onMouseUp = () => { panning.current = false; };

  // Wheel zoom
  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => Math.max(0.3, Math.min(1.5, +(z - e.deltaY * 0.001).toFixed(3))));
    }
  };

  const tree = data?.tree || [];
  const afterDept   = deptFilter ? filterByDept(tree, deptFilter) : tree;
  const displayTree = search ? filterTree(afterDept, search) : afterDept;
  const totalVisible = countTotal(displayTree);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-oe-muted">Building org chart…</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* ═══ PAGE HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
            <GitBranch size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-oe-text">Organization Chart</h1>
            <p className="text-sm text-oe-muted">
              {data?.is_partial
                ? 'Showing your team hierarchy'
                : `Full company hierarchy · ${(data?.all || []).length} employees`}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 rounded-lg px-3 py-1.5">
            <Users size={13} className="text-oe-primary" />
            <span className="text-xs font-semibold text-oe-text">{totalVisible} shown</span>
          </div>
          {isFullAccess && (
            <div className="flex items-center gap-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 rounded-lg px-3 py-1.5">
              <Building2 size={13} className="text-oe-primary" />
              <span className="text-xs font-semibold text-oe-text">{departments.length} departments</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ CONTROLS ROW ═══ */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted pointer-events-none" />
          <input
            className="input pl-8 pr-8 text-sm py-1.5"
            placeholder="Search by name, title, department…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-oe-muted hover:text-oe-text">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 rounded-lg p-1">
          <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)))}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/8 text-oe-muted hover:text-oe-text transition-colors" title="Zoom out (Ctrl–)">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-semibold text-oe-text w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(1)))}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/8 text-oe-muted hover:text-oe-text transition-colors" title="Zoom in (Ctrl+)">
            <ZoomIn size={14} />
          </button>
          <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <button onClick={resetView}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/8 text-oe-muted hover:text-oe-text transition-colors" title="Reset view (Ctrl+0)">
            <Maximize2 size={14} />
          </button>
        </div>

        {/* Expand all toggle */}
        <button
          onClick={() => setExpandAll(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            expandAll
              ? 'bg-oe-primary/10 border-oe-primary/30 text-oe-primary'
              : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-oe-muted hover:text-oe-text'
          }`}
        >
          {expandAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expandAll ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {/* ═══ DEPARTMENT FILTER PILLS (admin only) ═══ */}
      {isFullAccess && departments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {departments.map(d => (
            <button key={d.id}
              onClick={() => setDeptFilter(deptFilter === d.id ? '' : d.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 ${
                deptFilter === d.id
                  ? 'bg-oe-primary text-white border-oe-primary shadow-sm'
                  : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-oe-muted hover:text-oe-text hover:border-oe-primary/30'
              }`}>
              {d.name}
              <span className={`ml-1.5 text-[10px] ${deptFilter === d.id ? 'opacity-80' : 'opacity-50'}`}>
                {d.active_count || 0}
              </span>
            </button>
          ))}
          {deptFilter && (
            <button onClick={() => setDeptFilter('')} className="px-3 py-1 rounded-full text-xs text-oe-muted hover:text-oe-text border border-dashed border-slate-300 dark:border-white/15">
              Clear ×
            </button>
          )}
        </div>
      )}

      {/* ═══ RESTRICTED BANNER ═══ */}
      {data?.is_partial && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/8 border border-indigo-200 dark:border-indigo-500/20 text-xs text-indigo-700 dark:text-indigo-300">
          <User size={13} className="flex-shrink-0" />
          <span>You're viewing <strong>your team hierarchy</strong>. Only Super Admins and HR Admins can see the full company organogram.</span>
        </div>
      )}

      {/* ═══ CANVAS ═══ */}
      <div
        ref={canvasRef}
        className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-white/8 bg-white dark:bg-slate-950/60"
        style={{ minHeight: 520, flex: 1, cursor: panning.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {/* Grid background */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(99,102,241,0.08) 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />

        {/* Tree content */}
        <div
          className="absolute inset-0 flex items-start justify-center py-10 px-8"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'top center',
            transition: panning.current ? 'none' : 'transform 0.15s ease',
            minWidth: 'max-content',
          }}
        >
          {displayTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-14 h-14 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center">
                <Users size={26} className="text-slate-300 dark:text-white/20" />
              </div>
              <p className="text-oe-muted text-sm font-medium">No employees match your search</p>
              <button onClick={() => { setSearch(''); setDeptFilter(''); }} className="text-xs text-oe-primary hover:underline">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="flex gap-10 flex-wrap justify-center">
              {displayTree.map(node => (
                <TreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  currentEmpId={data?.current_employee_id}
                  forceExpanded={expandAll || Boolean(search)}
                  onNavigate={(path) => router.push(path)}
                  search={search}
                />
              ))}
            </div>
          )}
        </div>

        {/* Zoom hint */}
        <div className="absolute bottom-3 right-4 text-[10px] text-oe-muted/40 pointer-events-none select-none">
          Ctrl+scroll to zoom · drag to pan
        </div>
      </div>

      {/* ═══ LEGEND ═══ */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
        {LEVEL_CFG.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: c.lineColor }} />
            <span className="text-xs text-oe-muted">{c.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-3 h-3 rounded-full bg-indigo-500" />
          <span className="text-xs text-oe-muted">You</span>
        </div>
      </div>
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────
export default function OrganogramPage() {
  return (
    <PrivateRoute>
      <Layout>
        <OrganogramContent />
      </Layout>
    </PrivateRoute>
  );
}
