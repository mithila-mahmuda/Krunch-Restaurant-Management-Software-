"use client";

import { CategoryGrid } from "@/components/pos/CategoryGrid";
import { MobileOrderBar } from "@/components/pos/MobileOrderBar";
import { NavDrawer } from "@/components/pos/NavDrawer";
import { OrderSidebar } from "@/components/pos/OrderSidebar";
import { PosHeader } from "@/components/pos/PosHeader";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { ProductSearch } from "@/components/pos/ProductSearch";
import { StatusToast } from "@/components/pos/StatusToast";
import { usePosStore } from "@/store/pos-store";

export function PosScreen() {
  const activeCategoryId = usePosStore((state) => state.activeCategoryId);

  return (
    <div className="pos-shell flex h-dvh flex-col overflow-hidden bg-[var(--pos-canvas)]">
      <PosHeader />
      <div className="relative flex min-h-0 flex-1">
        <section className="relative flex min-w-0 flex-1 overflow-hidden bg-[var(--pos-menu)]">
          <div
            className={`min-w-0 overflow-hidden ${activeCategoryId ? "w-1/2 border-r border-slate-200" : "w-full"
              }`}
          >
            <CategoryGrid compact={Boolean(activeCategoryId)} />
          </div>
          {activeCategoryId ? (
            <div className="min-w-0 w-1/2 overflow-hidden">
              <ProductGrid />
            </div>
          ) : null}
          <ProductSearch />
        </section>
        <OrderSidebar />
      </div>
      <MobileOrderBar />
      <NavDrawer />
      <StatusToast />
    </div>
  );
}
