"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ItemPurchaseScreen } from "@/components/modules/ItemPurchaseScreen";

export default function ItemPurchasePage() {
  return (
    <RequireAuth permission="access_purchases">
      <Suspense
        fallback={
          <div className="flex h-dvh items-center justify-center bg-[var(--module-bg)] text-slate-500">
            Loading item purchase…
          </div>
        }
      >
        <ItemPurchaseScreen />
      </Suspense>
    </RequireAuth>
  );
}
