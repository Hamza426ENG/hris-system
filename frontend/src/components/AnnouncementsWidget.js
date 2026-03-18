import React, { useState, useEffect } from 'react';
import { Megaphone, ChevronRight } from 'lucide-react';
import { announcementsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const PRIORITY_STYLE = {
  urgent: 'border-red-500 bg-red-50',
  high:   'border-orange-400 bg-orange-50',
  normal: 'border-oe-primary bg-blue-50',
  low:    'border-slate-300 bg-oe-surface',
};

export default function AnnouncementsWidget({ limit = 20, scrollable = false }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHR = ['super_admin', 'hr_admin'].includes(user?.role);

  useEffect(() => {
    announcementsAPI.list()
      .then(res => setAnnouncements((res.data || []).slice(0, limit)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) return null;

  return (
    <div className="card p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-oe-danger" />
          <h3 className="font-semibold text-oe-text text-sm">Announcements</h3>
        </div>
        {isHR && (
          <button
            onClick={() => navigate('/announcements')}
            className="text-xs text-oe-primary hover:underline flex items-center gap-0.5"
          >
            Manage <ChevronRight size={12} />
          </button>
        )}
      </div>

      {announcements.length === 0 ? (
        <p className="text-xs text-oe-muted text-center py-6">No active announcements</p>
      ) : (
        <div className="space-y-2.5 overflow-y-auto pr-0.5" style={{ maxHeight: '50vh' }}>
          {announcements.map(a => (
            <div
              key={a.id}
              className={`p-3 rounded-lg border-l-4 ${PRIORITY_STYLE[a.priority] || PRIORITY_STYLE.normal}`}
            >
              <div className="font-medium text-oe-text text-sm leading-snug line-clamp-2">{a.title}</div>
              <div className="text-xs text-oe-muted mt-0.5 line-clamp-2">{a.content}</div>
              <div className="text-xs text-oe-muted mt-1 flex items-center gap-1.5">
                {a.posted_by_name && <span>By {a.posted_by_name} ·</span>}
                <span>{fmtDate(a.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
