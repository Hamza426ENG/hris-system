import React, { useState, useEffect, useCallback } from 'react';
import { profileRequestsAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';
import Modal from '@/components/common/Modal';
import { ClipboardList, Check, X, Eye, RefreshCw } from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const fmtField = (f) => f?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function ProfileRequestsContent() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [detailModal, setDetailModal] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await profileRequestsAPI.list({ status: filter || undefined });
      setRequests(res.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    setProcessing(true);
    try {
      await profileRequestsAPI.approve(id, { review_notes: reviewNotes });
      setDetailModal(null);
      setReviewNotes('');
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed to approve'); }
    finally { setProcessing(false); }
  };

  const handleReject = async (id) => {
    if (!reviewNotes.trim()) { alert('Please provide a reason for rejection'); return; }
    setProcessing(true);
    try {
      await profileRequestsAPI.reject(id, { review_notes: reviewNotes });
      setDetailModal(null);
      setReviewNotes('');
      load();
    } catch (err) { alert(err.response?.data?.error || 'Failed to reject'); }
    finally { setProcessing(false); }
  };

  if (!isHR) {
    return <div className="card text-center py-12 text-oe-muted">You do not have permission to view this page.</div>;
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-oe-primary" />
          <h1 className="text-lg font-bold text-oe-text">Profile Change Requests</h1>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-40 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          {user?.role === 'super_admin' && (
            <button onClick={load} disabled={loading} className="btn-secondary px-2.5" title="Refresh">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-oe-surface/50">
              <tr>
                <th className="table-header">Employee</th>
                <th className="table-header">Changes</th>
                <th className="table-header">Requested</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-oe-muted">
                  <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading...
                </td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-oe-muted">No requests found</td></tr>
              ) : requests.map(r => {
                const fields = Object.keys(r.changes || {});
                const statusCls = r.status === 'approved' ? 'badge-approved' : r.status === 'rejected' ? 'badge-rejected' : 'badge-pending';
                return (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 gradient-bg rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                          {r.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-oe-text">{r.employee_name}</div>
                          <div className="text-xs text-oe-muted">{r.employee_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-xs text-oe-muted">
                      {fields.slice(0, 3).map(f => fmtField(f)).join(', ')}
                      {fields.length > 3 && ` +${fields.length - 3} more`}
                    </td>
                    <td className="table-cell text-xs text-oe-muted">{fmtDate(r.created_at)}</td>
                    <td className="table-cell"><span className={statusCls}>{r.status}</span></td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setDetailModal(r); setReviewNotes(''); }} className="p-1.5 hover:bg-oe-surface rounded-lg text-oe-muted hover:text-oe-primary transition-colors" title="View details">
                          <Eye size={14} />
                        </button>
                        {r.status === 'pending' && (
                          <>
                            <button onClick={() => { setDetailModal(r); setReviewNotes(''); }} className="p-1.5 hover:bg-oe-success/10 rounded-lg text-oe-muted hover:text-oe-success transition-colors" title="Approve">
                              <Check size={14} />
                            </button>
                            <button onClick={() => { setDetailModal(r); setReviewNotes(''); }} className="p-1.5 hover:bg-oe-danger/10 rounded-lg text-oe-muted hover:text-oe-danger transition-colors" title="Reject">
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-oe-border">
          {loading ? (
            <div className="text-center py-12 text-oe-muted">
              <div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading...
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-oe-muted">No requests found</div>
          ) : requests.map(r => {
            const fields = Object.keys(r.changes || {});
            const statusCls = r.status === 'approved' ? 'badge-approved' : r.status === 'rejected' ? 'badge-rejected' : 'badge-pending';
            return (
              <div key={r.id} className="p-4 space-y-2" onClick={() => { setDetailModal(r); setReviewNotes(''); }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-oe-text">{r.employee_name}</span>
                  <span className={statusCls}>{r.status}</span>
                </div>
                <div className="text-xs text-oe-muted">{fields.map(f => fmtField(f)).join(', ')}</div>
                <div className="text-xs text-oe-muted">{fmtDate(r.created_at)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail / Review Modal */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="Profile Change Request" size="md">
        {detailModal && (
          <div className="p-4 sm:p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 gradient-bg rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                {detailModal.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="font-semibold text-oe-text">{detailModal.employee_name}</div>
                <div className="text-xs text-oe-muted">{detailModal.employee_code} · {fmtDate(detailModal.created_at)}</div>
              </div>
              <span className={`ml-auto ${detailModal.status === 'approved' ? 'badge-approved' : detailModal.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}`}>
                {detailModal.status}
              </span>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Requested Changes</h4>
              <div className="space-y-2">
                {Object.entries(detailModal.changes || {}).map(([field, value]) => (
                  <div key={field} className="flex items-center justify-between py-2 border-b border-oe-border/30 last:border-0">
                    <span className="text-sm text-oe-muted">{fmtField(field)}</span>
                    <span className="text-sm font-medium text-oe-text">{value || '(empty)'}</span>
                  </div>
                ))}
              </div>
            </div>

            {detailModal.status === 'pending' && (
              <>
                <div>
                  <label className="label">Review Notes (required for rejection)</label>
                  <textarea className="input" rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Optional notes..." />
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3">
                  <button onClick={() => handleReject(detailModal.id)} disabled={processing} className="btn-secondary justify-center gap-1.5 text-oe-danger hover:bg-oe-danger/10">
                    <X size={14} /> Reject
                  </button>
                  <button onClick={() => handleApprove(detailModal.id)} disabled={processing} className="btn-primary justify-center gap-1.5 bg-oe-success hover:bg-oe-success/90">
                    {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
                    Approve & Apply
                  </button>
                </div>
              </>
            )}

            {detailModal.review_notes && detailModal.status !== 'pending' && (
              <div className="bg-oe-surface rounded-lg p-3">
                <div className="text-xs text-oe-muted mb-1">Review Notes by {detailModal.reviewer_name}</div>
                <div className="text-sm text-oe-text">{detailModal.review_notes}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function ProfileRequestsPage() {
  return (
    <PrivateRoute>
      <Layout>
        <ProfileRequestsContent />
      </Layout>
    </PrivateRoute>
  );
}
