"use client";

import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";

interface PosDialogProps {
  open: boolean;
  title: string;
  /** Secondary line under the title (e.g. reference id). */
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Shown to the left of the close control in the header. */
  headerActions?: ReactNode;
  /** Override default max width (`max-w-md`). */
  className?: string;
}

export function PosDialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  headerActions,
  className = "",
}: PosDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        className="pos-dialog-backdrop absolute inset-0"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`pos-dialog relative z-10 flex max-h-[min(92dvh,820px)] w-full flex-col overflow-hidden rounded-xl ${className || "max-w-md"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="font-[family-name:var(--font-display)] text-lg font-bold"
            >
              {title}
            </h2>
            {subtitle ? (
              <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-200 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
