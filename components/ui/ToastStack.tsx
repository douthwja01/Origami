"use client";

import { useEffect } from "react";

export type ToastKind = "success" | "warning" | "error";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  items?: string[];
};

type Props = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  success: 6000,
  warning: 10000,
  error: 12000,
};

function kindClass(kind: ToastKind) {
  if (kind === "success") return "border-done/40";
  if (kind === "warning") return "border-hold/40";
  return "border-accent/50";
}

function kindDot(kind: ToastKind) {
  if (kind === "success") return "bg-done";
  if (kind === "warning") return "bg-hold";
  return "bg-accent";
}

export function ToastStack({ toasts, onDismiss }: Props) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(toast.id),
      AUTO_DISMISS_MS[toast.kind],
    );
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id, toast.kind]);

  return (
    <div
      role="status"
      className={`pointer-events-auto rounded-lg border bg-raised p-3 shadow-2xl ${kindClass(toast.kind)}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kindDot(toast.kind)}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">{toast.title}</p>
          {toast.items && toast.items.length > 0 ? (
            <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-auto text-[12px] text-muted">
              {toast.items.map((item) => (
                <li key={item} className="truncate font-mono">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 text-[12px] text-muted hover:text-ink"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
