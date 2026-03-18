import React, { useState, useEffect, useRef } from 'react';
import { Megaphone, AlertTriangle, Info, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { announcementsAPI } from '../services/api';

const PRIORITY_CONFIG = {
  urgent:  { label: 'Urgent',  bg: 'bg-red-500',    text: 'text-red-600',    border: 'border-red-200',    icon: AlertTriangle, ring: 'ring-red-300' },
  high:    { label: 'High',    bg: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-200', icon: AlertTriangle, ring: 'ring-orange-300' },
  normal:  { label: 'Normal',  bg: 'bg-blue-500',   text: 'text-blue-600',   border: 'border-blue-200',   icon: Info,          ring: 'ring-blue-300' },
  low:     { label: 'Low',     bg: 'bg-slate-400',  text: 'text-slate-600',  border: 'border-slate-200',  icon: CheckCircle2,  ring: 'ring-slate-300' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export default function AnnouncementPopup({ announcements, onAllAcknowledged }) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const feedbackRef = useRef(null);

  const current = announcements[index];

  useEffect(() => {
    setFeedback('');
    // Focus textarea after transition
    setTimeout(() => feedbackRef.current?.focus(), 100);
  }, [index]);

  if (!current) return null;

  const cfg = PRIORITY_CONFIG[current.priority] || PRIORITY_CONFIG.normal;
  const PriorityIcon = cfg.icon;
  const total = announcements.length;
  const isLast = index === total - 1;

  const handleAcknowledge = async () => {
    setLoading(true);
    try {
      await announcementsAPI.acknowledge(current.id, feedback.trim() || null);
      if (isLast) {
        onAllAcknowledged();
      } else {
        setIndex(i => i + 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    // Ctrl+Enter or Cmd+Enter submits from textarea
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAcknowledge();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg ring-4 ${cfg.ring} ring-opacity-40 overflow-hidden`}>
        {/* Priority banner */}
        <div className={`${cfg.bg} px-5 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2 text-white">
            <PriorityIcon size={16} />
            <span className="text-sm font-semibold uppercase tracking-wide">{cfg.label} Priority Announcement</span>
          </div>
          {total > 1 && (
            <span className="text-white/80 text-xs font-medium">{index + 1} / {total}</span>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Icon + title */}
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg} bg-opacity-10`}>
              <Megaphone size={20} className={cfg.text} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900 leading-snug">{current.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {current.posted_by_name ? `By ${current.posted_by_name}` : 'HR / Admin'} · {fmtDate(current.created_at)}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-100">
            {current.content}
          </div>

          {/* Feedback */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Leave feedback (optional) — press <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-600 text-xs font-mono">Ctrl+Enter</kbd> to submit
            </label>
            <textarea
              ref={feedbackRef}
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="Your thoughts on this announcement..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            You must acknowledge to continue using the system
          </p>
          <button
            onClick={handleAcknowledge}
            disabled={loading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition disabled:opacity-60 ${cfg.bg} hover:opacity-90`}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={15} />
                {isLast ? 'I Acknowledge' : `Acknowledge & Next`}
                {!isLast && <ChevronRight size={14} />}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
