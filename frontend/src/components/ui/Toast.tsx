'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './Icon';

/**
 * App-wide transient messages.
 *
 * This replaces two different things that used to coexist: `window.alert()`
 * (which blocks the main thread, cannot be styled, and is indistinguishable
 * from a browser error) and a bespoke coloured bar wedged between the header
 * and the workspace (which pushed the whole page down by its own height every
 * time it appeared, shifting whatever you were about to click).
 *
 * Toasts are overlaid and self-dismissing, so neither happens.
 */

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Ms before auto-dismiss. 0 keeps it up until dismissed. */
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone, duration?: number) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return value;
}

const TONE_STYLE: Record<ToastTone, { border: string; text: string; bg: string }> = {
  success: {
    border: 'var(--positive)',
    text: 'var(--positive)',
    bg: 'var(--positive-soft)',
  },
  error: {
    border: 'var(--danger)',
    text: 'var(--danger)',
    bg: 'var(--danger-soft)',
  },
  info: {
    border: 'var(--border-strong)',
    text: 'var(--text)',
    bg: 'var(--bg-raised)',
  },
};

const TONE_ICON: Record<ToastTone, typeof CheckIcon> = {
  success: CheckIcon,
  error: AlertIcon,
  info: InfoIcon,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info', duration = 4000) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current, { id, tone, message, duration }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Never leave a timer running past unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        // Announced by screen readers without stealing focus.
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((item) => {
          const style = TONE_STYLE[item.tone];
          const ToneIcon = TONE_ICON[item.tone];
          return (
            <div
              key={item.id}
              className="toast-enter pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius)] border px-3.5 py-3 text-sm shadow-[var(--shadow-lg)]"
              style={{
                borderColor: style.border,
                background: style.bg,
                color: style.text,
              }}
            >
              <span className="mt-px shrink-0">
                <ToneIcon size={16} />
              </span>
              <span className="min-w-0 flex-1 leading-snug">{item.message}</span>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="tap -mr-1 shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
