import React, { useState, useEffect, useCallback, useRef } from 'react';
import { organogramAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Search, Users, ChevronUp, X } from 'lucide-react';
import Avatar from '../components/Avatar';

// ─── helpers ────────────────────────────────────────────────────────────────

function flattenTree(nodes, parentId = null, result = []) {
  for (const node of nodes) {
    result.push({ ...node, parentId, children: node.children || [] });
    if (node.children?.length) flattenTree(node.children, node.id, result);
  }
  return result;
}

function buildLookup(flat) {
  const map = {};
  for (const n of flat) map[n.id] = n;
  return map;
}

function findRoots(tree) {
  return tree || [];
}

// ─── PersonCard ─────────────────────────────────────────────────────────────

function PersonCard({ node, variant = 'default', onFocus, navigate, isSearchResult = false }) {
  // variant: 'focused' | 'manager' | 'grandmanager' | 'report' | 'default'
  const isFocused = variant === 'focused';
  const isManager = variant === 'manager' || variant === 'grandmanager';
  const directReportCount = node.children?.length ?? 0;

  const ringStyle = isFocused
    ? 'border-2 border-[#1D6BE4] shadow-lg shadow-blue-100'
    : isManager
    ? 'border-2 border-[#7C3AED] shadow-md shadow-purple-50'
    : 'border border-oe-border shadow-sm hover:shadow-md';

  const avatarRing = isFocused
    ? 'ring-2 ring-[#1D6BE4]'
    : isManager
    ? 'ring-2 ring-[#7C3AED]'
    : 'ring-2 ring-oe-border';

  const titleColor = isFocused
    ? 'text-[#1D6BE4]'
    : isManager
    ? 'text-[#7C3AED]'
    : 'text-oe-muted';

  const cardWidth = isFocused ? 'w-52' : 'w-44';

  return (
    <div
      className={`bg-white rounded-2xl px-4 py-4 cursor-pointer transition-all duration-200 hover:scale-[1.02] ${ringStyle} ${cardWidth} flex flex-col items-center text-center select-none`}
      onClick={() => onFocus(node.id)}
    >
      {/* Avatar */}
      <div className={`rounded-full overflow-hidden mb-3 ${avatarRing} ${isFocused ? 'w-14 h-14' : 'w-10 h-10'}`}>
        <Avatar
          src={node.avatar_url}
          firstName={node.first_name}
          lastName={node.last_name}
          size={isFocused ? 56 : 40}
        />
      </div>

      {/* Name */}
      <div className={`font-semibold leading-tight truncate w-full ${isFocused ? 'text-sm' : 'text-xs'} text-oe-text`}>
        {node.first_name} {node.last_name}
      </div>

      {/* Title */}
      <div className={`text-xs truncate w-full mt-0.5 ${titleColor}`}>
        {node.position_title || 'No title'}
      </div>

      {/* Department */}
      {node.department_name && (
        <div className="text-xs text-oe-muted truncate w-full mt-0.5">
          {node.department_name}
        </div>
      )}

      {/* Direct reports badge */}
      {directReportCount > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-oe-muted bg-oe-surface rounded-full px-2 py-0.5">
          <Users size={10} />
          <span>{directReportCount}</span>
        </div>
      )}

      {/* View Profile button */}
      <button
        className="mt-3 w-full text-xs py-1.5 rounded-lg border border-oe-border text-oe-muted hover:border-oe-primary hover:text-oe-primary transition-colors"
        onClick={e => {
          e.stopPropagation();
          navigate(`/employees/${node.id}`);
        }}
      >
        View Profile
      </button>
    </div>
  );
}

// ─── Connector line (vertical segment) ──────────────────────────────────────

function VLine({ height = 32, color = '#E5E7EB' }) {
  return (
    <div
      className="mx-auto"
      style={{ width: 2, height, background: color, borderRadius: 2 }}
    />
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Organogram() {
  const [rawTree, setRawTree] = useState([]);
  const [flat, setFlat] = useState([]);
  const [lookup, setLookup] = useState({});
  const [focusedId, setFocusedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    organogramAPI
      .get()
      .then(r => {
        const tree = r.data?.tree || [];
        const flatList = flattenTree(tree);
        const lkp = buildLookup(flatList);
        setRawTree(tree);
        setFlat(flatList);
        setLookup(lkp);
        // Default focus = first root (CEO)
        const roots = findRoots(tree);
        if (roots.length > 0) setFocusedId(roots[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    const q = search.toLowerCase();
    const results = flat
      .filter(n =>
        `${n.first_name} ${n.last_name} ${n.position_title || ''} ${n.department_name || ''}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 12);
    setSearchResults(results);
    setShowSearchDropdown(results.length > 0);
  }, [search, flat]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleFocus = useCallback(
    id => {
      setFocusedId(id);
      setSearch('');
      setShowSearchDropdown(false);
    },
    []
  );

  const handleGoToTop = useCallback(() => {
    const roots = findRoots(rawTree);
    if (roots.length > 0) setFocusedId(roots[0].id);
  }, [rawTree]);

  // ── Derive view data ───────────────────────────────────────────────────────
  const focused = focusedId ? lookup[focusedId] : null;
  const manager = focused?.parentId ? lookup[focused.parentId] : null;
  const grandManager = manager?.parentId ? lookup[manager.parentId] : null;
  const directReports = focused?.children || [];

  const isAtRoot = !manager;
  const hasAnyData = !!focused;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!hasAnyData) {
    return (
      <div className="card flex flex-col items-center justify-center py-20 text-center">
        <Users size={48} className="text-oe-border mb-4" />
        <div className="text-lg font-semibold text-oe-text mb-1">No organization data</div>
        <div className="text-sm text-oe-muted">Add employees and assign managers to build the organogram.</div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Header bar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-0" ref={searchRef}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-oe-muted pointer-events-none" />
          <input
            className="input pl-9 pr-9 w-full"
            placeholder="Search any employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-oe-muted hover:text-oe-text"
              onClick={() => { setSearch(''); setShowSearchDropdown(false); }}
            >
              <X size={14} />
            </button>
          )}

          {/* Search dropdown */}
          {showSearchDropdown && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-oe-border rounded-xl shadow-xl overflow-hidden">
              {searchResults.map(person => (
                <button
                  key={person.id}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-oe-surface transition-colors text-left"
                  onClick={() => handleFocus(person.id)}
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-oe-border flex-shrink-0">
                    <Avatar src={person.avatar_url} firstName={person.first_name} lastName={person.last_name} size={32} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-oe-text truncate">
                      {person.first_name} {person.last_name}
                    </div>
                    <div className="text-xs text-oe-muted truncate">
                      {person.position_title}{person.department_name ? ` · ${person.department_name}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Go to top */}
        {!isAtRoot && (
          <button
            className="btn-secondary flex items-center gap-2 whitespace-nowrap"
            onClick={handleGoToTop}
          >
            <ChevronUp size={15} />
            <span className="hidden sm:inline">Go to top</span>
            <span className="sm:hidden">Top</span>
          </button>
        )}
      </div>

      {/* ── Organogram canvas ── */}
      <div className="card overflow-x-auto overflow-y-visible p-0" style={{ minHeight: 420 }}>
        <div className="min-w-max px-6 py-8 flex flex-col items-center gap-0">

          {/* ── Grand-manager row ── */}
          {grandManager && (
            <>
              <div className="flex flex-col items-center">
                <div className="mb-1">
                  <span className="inline-block text-xs font-medium text-[#7C3AED] bg-purple-50 border border-purple-200 rounded-full px-3 py-0.5">
                    Manager's manager
                  </span>
                </div>
                <PersonCard
                  node={grandManager}
                  variant="grandmanager"
                  onFocus={handleFocus}
                  navigate={navigate}
                />
              </div>
              <VLine height={28} color="#DDD6FE" />
            </>
          )}

          {/* ── Manager row ── */}
          {manager && (
            <>
              <div className="flex flex-col items-center">
                <div className="mb-1">
                  <span className="inline-block text-xs font-medium text-[#7C3AED] bg-purple-50 border border-purple-200 rounded-full px-3 py-0.5">
                    You report to
                  </span>
                </div>
                <PersonCard
                  node={manager}
                  variant="manager"
                  onFocus={handleFocus}
                  navigate={navigate}
                />
              </div>
              <VLine height={28} color="#DDD6FE" />
            </>
          )}

          {/* ── Focused person ── */}
          <div className="flex flex-col items-center">
            {isAtRoot && (
              <div className="mb-1">
                <span className="inline-block text-xs font-medium text-[#1D6BE4] bg-blue-50 border border-blue-200 rounded-full px-3 py-0.5">
                  Top of organization
                </span>
              </div>
            )}
            <PersonCard
              node={focused}
              variant="focused"
              onFocus={handleFocus}
              navigate={navigate}
            />
          </div>

          {/* ── Direct reports section ── */}
          {directReports.length > 0 ? (
            <>
              <VLine height={28} color="#BFDBFE" />

              {/* Label */}
              <div className="mb-3">
                <span className="inline-block text-xs font-medium text-[#1D6BE4] bg-blue-50 border border-blue-200 rounded-full px-3 py-0.5">
                  Direct reports ({directReports.length})
                </span>
              </div>

              {/* Horizontal connector line across all report columns */}
              <div className="relative w-full flex flex-col items-center">
                {directReports.length > 1 && (
                  <div
                    className="absolute top-0 h-0.5 bg-[#BFDBFE] rounded"
                    style={{
                      left: `calc(${(1 / directReports.length) * 50}%)`,
                      right: `calc(${(1 / directReports.length) * 50}%)`,
                    }}
                  />
                )}

                {/* Report cards row — horizontally scrollable on mobile */}
                <div
                  className="flex gap-4 overflow-x-auto pb-2 max-w-full"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {directReports.map(report => (
                    <div key={report.id} className="flex flex-col items-center flex-shrink-0">
                      <VLine height={20} color="#BFDBFE" />
                      <PersonCard
                        node={report}
                        variant="report"
                        onFocus={handleFocus}
                        navigate={navigate}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* No direct reports */
            !manager && (
              /* Person has no manager AND no reports — full empty state */
              <div className="mt-8 flex flex-col items-center text-center text-oe-muted py-6">
                <Users size={32} className="mb-2 text-oe-border" />
                <div className="text-sm font-medium text-oe-text">No connections found</div>
                <div className="text-xs mt-1">This person has no manager and no direct reports.</div>
              </div>
            )
          )}

          {/* Note when focused has no direct reports but has a manager */}
          {directReports.length === 0 && manager && (
            <div className="mt-6 text-xs text-oe-muted italic">No direct reports</div>
          )}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-oe-muted px-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-[#7C3AED]" />
          Manager level
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-[#1D6BE4]" />
          Focused person
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-oe-border" />
          Direct reports
        </div>
        <div className="ml-auto text-xs text-oe-muted hidden sm:block">
          Click any card to re-center the view
        </div>
      </div>
    </div>
  );
}
