import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { organogramAPI, departmentsAPI } from '../services/api';
import { Search, ZoomIn, ZoomOut, Maximize2, Smartphone } from 'lucide-react';
import Avatar from '../components/Avatar';
import PrivateRoute from '../components/PrivateRoute';
import Layout from '../components/Layout';

const TreeNode = ({ node, onNavigate, level = 0 }) => {
  const hasChildren = node.children?.length > 0;

  return (
    <div className="flex flex-col items-center">
      <div
        className="bg-oe-card border-2 border-oe-border rounded-xl px-4 py-3 cursor-pointer hover:border-oe-primary hover:shadow-lg hover:shadow-oe-primary/10 transition-all duration-200 w-44 text-center relative z-10"
        style={{ borderColor: level === 0 ? '#1D6BE4' : undefined }}
        onClick={() => onNavigate(`/employees/${node.id}`)}
      >
        <div className={`mx-auto mb-2 w-12 h-12 rounded-full overflow-hidden ring-2 ${level === 0 ? 'ring-oe-primary' : level === 1 ? 'ring-purple-400' : 'ring-oe-border'}`}>
          <Avatar src={node.avatar_url} firstName={node.first_name} lastName={node.last_name} size={48} />
        </div>
        <div className="text-xs font-semibold text-oe-text truncate">{node.first_name} {node.last_name}</div>
        <div className="text-xs truncate mt-0.5" style={{ color: level === 0 ? '#1D6BE4' : '#7C5CFC' }}>{node.position_title || 'No title'}</div>
        <div className="text-xs text-oe-muted truncate">{node.department_name}</div>
        {hasChildren && <div className="mt-1 text-xs text-oe-muted/60">{node.children.length} direct report{node.children.length !== 1 ? 's' : ''}</div>}
      </div>

      {hasChildren && (
        <div className="relative w-full">
          <div className="w-px h-8 bg-oe-border mx-auto" />
          <div className="relative">
            {node.children.length > 1 && (
              <div className="absolute top-0 h-px bg-oe-border"
                style={{ left: `${(1 / node.children.length) * 50}%`, right: `${(1 / node.children.length) * 50}%` }} />
            )}
            <div className="flex gap-4 justify-center pt-0">
              {node.children.map((child) => (
                <div key={child.id} className="flex flex-col items-center">
                  <div className="w-px h-8 bg-oe-border" />
                  <TreeNode node={child} onNavigate={onNavigate} level={level + 1} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function OrganogramContent() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(0.8);
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');
  const scrollRef = useRef();
  const router = useRouter();

  useEffect(() => {
    organogramAPI.get().then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
    departmentsAPI.list().then(r => setDepartments(r.data)).catch(console.error);
  }, []);

  const filterTree = (nodes, q) => {
    if (!q) return nodes;
    return nodes.reduce((acc, node) => {
      const match = `${node.first_name} ${node.last_name} ${node.position_title} ${node.department_name}`.toLowerCase().includes(q.toLowerCase());
      const children = filterTree(node.children || [], q);
      if (match || children.length > 0) acc.push({ ...node, children });
      return acc;
    }, []);
  };

  const filterByDept = (nodes, deptId) => {
    if (!deptId) return nodes;
    return nodes.reduce((acc, node) => {
      const children = filterByDept(node.children || [], deptId);
      if (node.department_id === deptId || children.length > 0) {
        acc.push({ ...node, children });
      }
      return acc;
    }, []);
  };

  const tree = data?.tree || [];
  const filtered = search ? filterTree(tree, search) : tree;
  const displayTree = deptFilter ? filterByDept(filtered, deptFilter) : filtered;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="md:hidden flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
        <Smartphone size={14} className="flex-shrink-0" />
        <span>Rotate your device to landscape for the best view. Pinch to zoom and scroll to navigate.</span>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
          <input className="input pl-9" placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 justify-end sm:justify-start">
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="btn-secondary px-2.5 py-2 min-h-[44px]"><ZoomOut size={15} /></button>
          <span className="text-xs text-oe-muted w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} className="btn-secondary px-2.5 py-2 min-h-[44px]"><ZoomIn size={15} /></button>
          <button onClick={() => setZoom(0.8)} className="btn-secondary px-2.5 py-2 min-h-[44px]" title="Reset"><Maximize2 size={15} /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {departments.slice(0, 6).map(d => (
          <button key={d.id}
            onClick={() => setDeptFilter(deptFilter === d.id ? '' : d.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[36px] ${deptFilter === d.id ? 'bg-oe-primary/10 border-oe-primary text-oe-primary' : 'bg-oe-surface border-oe-border text-oe-muted hover:text-oe-text'}`}>
            {d.name} <span className="opacity-60">({d.active_count || 0})</span>
          </button>
        ))}
        {deptFilter && <button onClick={() => setDeptFilter('')} className="px-3 py-1.5 rounded-lg text-xs text-oe-muted hover:text-oe-text">Clear filter</button>}
      </div>

      <div
        className="card overflow-auto touch-pan-x touch-pan-y"
        style={{ minHeight: 400, WebkitOverflowScrolling: 'touch' }}
      >
        <div
          ref={scrollRef}
          className="min-w-max flex justify-center py-8 px-8"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}
        >
          {displayTree.length === 0 ? (
            <div className="text-oe-muted text-sm py-12">No employees match your search</div>
          ) : (
            <div className="flex gap-8 flex-wrap justify-center">
              {displayTree.map(node => <TreeNode key={node.id} node={node} onNavigate={(path) => router.push(path)} level={0} />)}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-oe-muted">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(135deg, #1D6BE4, #7C3AED)' }} /> C-Level</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(135deg, #7C3AED, #00D4FF)' }} /> Directors / VPs</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(135deg, #00D4AA, #1D6BE4)' }} /> Team Members</div>
      </div>
    </div>
  );
}

export default function OrganogramPage() {
  return (
    <PrivateRoute>
      <Layout>
        <OrganogramContent />
      </Layout>
    </PrivateRoute>
  );
}
