import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './toast.css';

/**
 * Non-blocking notifications with an optional action (used for Undo). One
 * provider per app, so each tab shows its own toasts while it is visible.
 */

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastOptions {
  action?: string;
  onAction?: () => void;
  actionIcon?: IconName;
  duration?: number;
  tone?: ToastTone;
}

export interface Toaster {
  show(message: string, options?: ToastOptions): () => void;
}

interface ToastRecord extends ToastOptions {
  id: number;
  message: string;
  leaving: boolean;
}

const MAX_VISIBLE = 3;

const ToastContext = createContext<Toaster | null>(null);

export function useToaster(): Toaster {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToaster must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const leaveTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // Never let a timer outlive the provider (e.g. when a test tears the tree down).
  useEffect(() => {
    const pending = timers.current;
    const leaving = leaveTimers.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
      for (const t of leaving) clearTimeout(t);
      pending.clear();
      leaving.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const leave = setTimeout(() => {
      leaveTimers.current.delete(leave);
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 150);
    leaveTimers.current.add(leave);
  }, []);

  const show = useCallback(
    (message: string, { duration = 5000, tone = 'neutral', ...rest }: ToastOptions = {}) => {
      const id = ++seq.current;
      setToasts((list) => {
        const next = [...list, { id, message, tone, duration, leaving: false, ...rest }];
        // Oldest toasts make room once the region is full.
        while (next.length > MAX_VISIBLE) {
          const dropped = next.shift();
          if (dropped) {
            const timer = timers.current.get(dropped.id);
            if (timer) clearTimeout(timer);
            timers.current.delete(dropped.id);
          }
        }
        return next;
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return () => dismiss(id);
    },
    [dismiss],
  );

  const toaster = useMemo<Toaster>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={toaster}>
      {children}
      <div className={`toast-region ${className}`.trim()} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone ?? 'neutral'}${t.leaving ? ' toast--leaving' : ''}`} data-testid="toast">
            <span className="toast__message">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                <Icon name={t.actionIcon ?? 'undo'} size={16} />
                {t.action}
              </button>
            )}
            <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
