import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, CheckCircle, Info, X } from 'lucide-react';

/**
 * Reusable confirmation dialog.
 *
 * Props:
 *   open          – boolean, controls visibility
 *   title         – string, modal heading
 *   message       – string | ReactNode, body text
 *   confirmLabel  – string (default "Confirm")
 *   cancelLabel   – string (default "Cancel")
 *   variant       – "danger" | "warning" | "success" | "primary" (default "primary")
 *   loading       – boolean, disables buttons and shows spinner on confirm
 *   onConfirm     – () => void
 *   onCancel      – () => void
 */
export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const cfg = {
    danger:  { Icon: Trash2,         iconBg: 'bg-red-100 dark:bg-red-900/30',    iconCls: 'text-red-500',    btn: 'bg-red-500 hover:bg-red-600 text-white' },
    warning: { Icon: AlertTriangle,  iconBg: 'bg-amber-100 dark:bg-amber-900/30', iconCls: 'text-amber-500', btn: 'bg-amber-500 hover:bg-amber-600 text-white' },
    success: { Icon: CheckCircle,    iconBg: 'bg-green-100 dark:bg-green-900/30', iconCls: 'text-green-500', btn: 'bg-oe-success hover:bg-green-600 text-white' },
    primary: { Icon: Info,           iconBg: 'bg-violet-100 dark:bg-violet-900/30', iconCls: 'text-oe-primary', btn: 'gradient-bg text-white' },
  }[variant] || cfg?.primary;

  const { Icon, iconBg, iconCls, btn } = cfg;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-white dark:bg-oe-card border border-oe-border rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 p-1 rounded-lg text-oe-muted hover:text-oe-text hover:bg-oe-surface transition-colors"
        >
          <X size={16} />
        </button>

        <div className="p-6 text-center space-y-4">
          {/* Icon */}
          <div className={`w-14 h-14 ${iconBg} rounded-full flex items-center justify-center mx-auto`}>
            <Icon size={26} className={iconCls} />
          </div>

          {/* Text */}
          <div>
            <h3 className="text-base font-semibold text-oe-text mb-1">{title}</h3>
            {message && (
              <p className="text-sm text-oe-muted leading-relaxed">{message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-oe-border text-oe-text text-sm font-medium hover:bg-oe-surface transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${btn}`}
            >
              {loading && (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {loading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
