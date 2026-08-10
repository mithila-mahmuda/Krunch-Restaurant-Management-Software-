"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { SettingsScreen } from "@/components/modules/SettingsScreen";

export default function SettingsPage() {
  return (
    <RequireAuth permission="access_settings">
      <Suspense
        fallback={
          <div className="flex h-dvh items-center justify-center bg-[var(--module-bg)] text-slate-500">
            Loading settings…
          </div>
        }
      >
        <SettingsScreen />
      </Suspense>
    </RequireAuth>
  );
}
