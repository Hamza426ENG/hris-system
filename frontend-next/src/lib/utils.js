/**
 * Shared utility functions used across the HRIS application.
 */

/** Format a number as USD currency with no decimals */
export const fmtCurrency = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n || 0);

/** Format an ISO date string to a short readable form (e.g. "Mar 23") */
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/** Format an ISO date string to a full readable form (e.g. "Mar 23, 2026") */
export const fmtDateFull = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

/** Return a human-readable "time ago" string from a timestamp */
export const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return fmtDate(ts);
};

/** Capitalize the first letter of a string */
export const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

/** Build a full employee display name */
export const fullName = (emp) =>
  emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : '';
