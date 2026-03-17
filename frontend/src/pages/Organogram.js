import React, { useState, useEffect, useRef } from 'react';
import { organogramAPI, departmentsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Search, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const NodeCard = ({ node, navigate }) => (
  <div className="relative">
    {/* Card */}
    <div
      className="bg-oe-card border border-oe-border rounded-xl px-4 py-3 cursor-pointer hover:border-oe-primary/50 hover:shadow-lg hover:shadow-oe-primary/10 transition-all duration-200 w-44 text-center group"
      onClick={() => navigate(`/employees/${node.id}`)}
    >
      <div className="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center text-sm font-bold text-white"
        style={{ background: 'linear-gradient(135deg, #1D6BE4, #7C5CFC)' }}>
        {`${node.first_name?.[0] || ''}${node.last_name?.[0] || ''}`.toUpperCase()}
      </div>
      <div className="text-xs font-semibold text-oe-text truncate">{node.first_name} {node.last_name}</div>
      <div className="text-xs text-oe-primary truncate mt-0.5">{node.position_title || 'No title'}</div>
      <div className="text-xs text-oe-muted truncate">{node.department_name || ''}</div>
      {node.children?.length > 0 && (
        <div className="mt-1.5 text-xs text-oe-muted/60">{node.children.length} report{node.children.length !== 1 ? 's' : ''}</div>
      )}
    </div>

    {/* Children */}
    {node.children?.length > 0 && (
      <div className="relative mt-6">
        {/* vertical line down from parent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-6 bg-oe-border" style={{ top: -24 }} />
        {/* horizontal line */}
        {node.children.length > 1 && (
          <div
            className="absolute bg-oe-border"
            style={{
              height: '1px',
              top: 0,
              left: `calc(${100 / node.children.length / 2}%)`,
              right: `calc(${100 / node.children.length / 2}%)`,
            }}
          />
        )}
        <div className={`flex gap-6 justify-center`}>
          {node.children.map(child => (
            <div key={child.id} className="flex flex-col items-center relative">
              {/* vertical line up to child */}
              <div className="w-px bg-oe-border mb-0" style={{ height: node.children.length > 1 ? 24 : 0 }} />
              <NodeCard node={child} navigate={navigate} />
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const TreeNode = ({ node, navigate, level = 0 }) => {
  const hasChildren = node.children?.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className="bg-oe-card border-2 border-oe-border rounded-xl px-4 py-3 cursor-pointer hover:border-oe-primary hover:shadow-lg hover:shadow-oe-primary/10 transition-all duration-200 w-44 text-center relative z-10"
        style={{ borderColor: level === 0 ? '#1D6BE4' : undefined }}
        onClick={() => navigate(`/employees/${node.id}`)}
      >
        <div className={`w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center text-sm font-bold text-white`}
          style={{ background: level === 0 ? 'linear-gradient(135deg, #1D6BE4, #7C5CFC)' : level === 1 ? 'linear-gradient(135deg, #7C5CFC, #00D4FF)' : 'linear-gradient(135deg, #00D4AA, #1D6BE4)' }}>
          {`${node.first_name?.[0] || ''}${node.last_name?.[0] || ''}`.toUpperCase()}
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
              {node.children.map((child, idx) => (
                <div key={child.id} className="flex flex-col items-center">
                  <div className="w-px h-8 bg-oe-border" />
                  <TreeNode node={child} navigate={navigate} level={level + 1} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function Organogram() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(0.8);
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');
  const scrollRef = useRef();
  const navigate = useNavigate();

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
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted" />
          <input className="input pl-9" placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="btn-secondary px-2.5 py-2"><ZoomOut size={15} /></button>
          <span className="text-xs text-oe-muted w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} className="btn-secondary px-2.5 py-2"><ZoomIn size={15} /></button>
          <button onClick={() => setZoom(0.8)} className="btn-secondary px-2.5 py-2" title="Reset"><Maximize2 size={15} /></button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        {departments.slice(0, 6).map(d => (
          <button key={d.id}
            onClick={() => setDeptFilter(deptFilter === d.id ? '' : d.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${deptFilter === d.id ? 'bg-oe-primary/10 border-oe-primary text-oe-primary' : 'bg-oe-surface border-oe-border text-oe-muted hover:text-oe-text'}`}>
            {d.name} <span className="opacity-60">({d.active_count || 0})</span>
          </button>
        ))}
        {deptFilter && <button onClick={() => setDeptFilter('')} className="px-3 py-1.5 rounded-lg text-xs text-oe-muted hover:text-oe-text">Clear filter</button>}
      </div>

      {/* Tree */}
      <div className="card overflow-auto" style={{ minHeight: 500 }}>
        <div
          ref={scrollRef}
          className="min-w-max flex justify-center py-8 px-8"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}
        >
          {displayTree.length === 0 ? (
            <div className="text-oe-muted text-sm py-12">No employees match your search</div>
          ) : (
            <div className="flex gap-8 flex-wrap justify-center">
              {displayTree.map(node => <TreeNode key={node.id} node={node} navigate={navigate} level={0} />)}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-oe-muted">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(135deg, #1D6BE4, #7C5CFC)' }} /> C-Level</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(135deg, #7C5CFC, #00D4FF)' }} /> Directors / VPs</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(135deg, #00D4AA, #1D6BE4)' }} /> Team Members</div>
      </div>
    </div>
  );
}
