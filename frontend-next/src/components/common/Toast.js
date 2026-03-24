import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: { icon: CheckCircle2, cls: 'text-emerald-500' },
  error:   { icon: AlertCircle,  cls: 'text-red-500' },
  info:    { icon: Info,         cls: 'text-blue-500' },
};

const BG = {
  success: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20',
  error:   'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20',
  info:    'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',
};

function ToastItem({ id, type = 'info', message, onRemove }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(id), 200);
    }, 4000);
    return () => clearTimeout(timer);
  }, [id, onRemove]);

  const cfg = ICONS[type] || ICONS.info;
  const Icon = cfg.icon;

  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border shadow-lg transition-all duration-200 max-w-sm ${BG[type] || BG.info}`}
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(-8px)' }}
    >
      <Icon size={16} className={cfg.cls} />
      <span className="text-sm text-slate-800 dark:text-white/90 flex-1">{message}</span>
      <button onClick={() => { setVisible(false); setTimeout(() => onRemove(id), 200); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-white/70">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
  }, [addToast]);

  // Make toast callable as toast.success(), toast.error(), toast.info()
  const contextValue = { toast: { success: (msg) => addToast(msg, 'success'), error: (msg) => addToast(msg, 'error'), info: (msg) => addToast(msg, 'info') } };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[300] space-y-2">
          {toasts.map(t => <ToastItem key={t.id} {...t} onRemove={removeToast} />)}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: { success: () => {}, error: () => {}, info: () => {} } };
  return ctx;
}
