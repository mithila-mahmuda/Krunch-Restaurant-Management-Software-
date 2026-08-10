"use client";

import { useEffect } from "react";
import { usePosStore } from "@/store/pos-store";

/** Compact till status strip — same chrome for info and warnings. */
export function StatusToast() {
  const statusMessage = usePosStore((state) => state.statusMessage);
  const statusTone = usePosStore((state) => state.statusTone);
  const setStatusMessage = usePosStore((state) => state.setStatusMessage);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [statusMessage, setStatusMessage]);

  if (!statusMessage) return null;

  const warning = statusTone === "warning";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[80] flex justify-center px-4 lg:bottom-5"
      role="status"
      aria-live="polite"
    >
      <p
        className={`max-w-md rounded px-3 py-1.5 text-center text-xs font-semibold shadow-md ${
          warning
            ? "bg-slate-900 text-[#ffe600]"
            : "bg-[var(--pos-header)] text-pos-on-header"
        }`}
      >
        {statusMessage}
      </p>
    </div>
  );
}
