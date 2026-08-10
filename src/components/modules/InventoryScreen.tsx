"use client";

import { useMemo, useState } from "react";
import { AssignedBranchBadge } from "@/components/AssignedBranchBadge";
import { SearchableMultiSelect } from "@/components/SearchableMultiSelect";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { useBranchFilter } from "@/hooks/useBranchFilter";
import { can } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth-store";
import { useOpsStore } from "@/store/ops-store";

export function InventoryScreen() {
  const items = useOpsStore((state) => state.inventory);
  const adjustInventory = useOpsStore((state) => state.adjustInventory);
  const role = useAuthStore((state) => state.user?.role);
  const canAdjust = can(role, "adjust_inventory");
  const {
    options: branchOptions,
    selectedBranchIds,
    setSelectedBranchIds,
    branchIds,
    allLabel: branchAllLabel,
    showBranchFilter,
    branchBadgeName,
  } = useBranchFilter();
  const [lowOnly, setLowOnly] = useState(false);

  const visible = useMemo(() => {
    const scoped = items.filter((item) => branchIds.includes(item.branchId));
    const list = lowOnly
      ? scoped.filter((item) => item.onHand < item.parLevel)
      : scoped;
    return [...list].sort(
      (a, b) => a.onHand / a.parLevel - b.onHand / b.parLevel,
    );
  }, [items, lowOnly, branchIds]);

  return (
    <ModuleShell
      title="Inventory"
      titleAddon={
        branchBadgeName ? (
          <AssignedBranchBadge name={branchBadgeName} />
        ) : null
      }
    >
      {!canAdjust ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          View only — cashiers and managers can adjust stock.
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        {showBranchFilter ? (
          <div className="max-w-xs min-w-[12rem] flex-1">
            <SearchableMultiSelect
              compact
              label="Branch"
              options={branchOptions}
              values={selectedBranchIds}
              onChange={setSelectedBranchIds}
              allLabel={branchAllLabel}
              searchPlaceholder="Search branches…"
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setLowOnly((value) => !value)}
          className={`min-h-10 shrink-0 rounded-md border px-3 text-sm font-semibold ${
            lowOnly
              ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          {lowOnly ? "Showing low stock" : "Low stock only"}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {visible.map((item) => {
            const low = item.onHand < item.parLevel;
            const ratio = Math.min(1, item.onHand / item.parLevel);
            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{item.name}</p>
                    {low ? (
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold uppercase text-rose-700">
                        Low
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-500">
                    {item.category} · target {item.parLevel} {item.unit}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        low ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canAdjust}
                    onClick={() => adjustInventory(item.id, -1)}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 font-bold hover:bg-slate-50 disabled:opacity-40"
                    aria-label={`Decrease ${item.name}`}
                  >
                    −
                  </button>
                  <p className="min-w-[88px] text-center text-sm font-bold">
                    {item.onHand} {item.unit}
                  </p>
                  <button
                    type="button"
                    disabled={!canAdjust}
                    onClick={() => adjustInventory(item.id, 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 font-bold hover:bg-slate-50 disabled:opacity-40"
                    aria-label={`Increase ${item.name}`}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </ModuleShell>
  );
}
