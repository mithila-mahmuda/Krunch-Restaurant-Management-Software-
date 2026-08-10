"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import { AssignedBranchBadge } from "@/components/AssignedBranchBadge";
import { SearchableMultiSelect } from "@/components/SearchableMultiSelect";
import { Select, type SelectOption } from "@/components/Select";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { PosDialog } from "@/components/pos/PosDialog";
import { useBranchFilter } from "@/hooks/useBranchFilter";
import type { InventoryItem } from "@/lib/module-data";
import { can } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth-store";
import { useOpsStore } from "@/store/ops-store";
import { useSettingsStore } from "@/store/settings-store";

type StockBand = "critical" | "low" | "ok";

const INVENTORY_UNIT_OPTIONS: SelectOption[] = [
  { value: "L", label: "Liters (L)" },
  { value: "ml", label: "Milliliters (ml)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "g", label: "Grams (g)" },
  { value: "pcs", label: "Pieces (pcs)" },
  { value: "slices", label: "Slices" },
  { value: "portions", label: "Portions" },
  { value: "boxes", label: "Boxes" },
  { value: "bottles", label: "Bottles" },
  { value: "cans", label: "Cans" },
  { value: "bags", label: "Bags" },
];

function unitOptionsFor(currentUnit: string): SelectOption[] {
  const unit = currentUnit.trim();
  if (!unit) return INVENTORY_UNIT_OPTIONS;
  if (INVENTORY_UNIT_OPTIONS.some((option) => option.value === unit)) {
    return INVENTORY_UNIT_OPTIONS;
  }
  return [{ value: unit, label: unit }, ...INVENTORY_UNIT_OPTIONS];
}

function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return (Math.round(value * 1000) / 1000).toString();
}

function stockBand(onHand: number, parLevel: number): StockBand {
  if (!(parLevel > 0)) return onHand > 0 ? "ok" : "critical";
  const ratio = onHand / parLevel;
  if (ratio <= 0.35) return "critical";
  if (ratio < 1) return "low";
  return "ok";
}

function StatusPill({ band }: { band: StockBand }) {
  if (band === "ok") {
    return (
      <span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        OK
      </span>
    );
  }
  if (band === "critical") {
    return (
      <span className="inline-flex rounded bg-rose-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-700">
        Critical
      </span>
    );
  }
  return (
    <span className="inline-flex rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
      Low
    </span>
  );
}

export function InventoryScreen() {
  const items = useOpsStore((state) => state.inventory);
  const updateInventoryStock = useOpsStore(
    (state) => state.updateInventoryStock,
  );
  const branches = useSettingsStore((state) => state.branches);
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
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [onHandDraft, setOnHandDraft] = useState("");
  const [unitDraft, setUnitDraft] = useState("pcs");
  const [editError, setEditError] = useState<string | null>(null);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branches) {
      map.set(branch.id, branch.name);
    }
    return map;
  }, [branches]);

  const scoped = useMemo(
    () => items.filter((item) => branchIds.includes(item.branchId)),
    [items, branchIds],
  );

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((item) => {
      const branchName = branchNameById.get(item.branchId) ?? "";
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        branchName.toLowerCase().includes(q)
      );
    });
  }, [scoped, query, branchNameById]);

  const belowCount = useMemo(
    () => searched.filter((item) => item.onHand < item.parLevel).length,
    [searched],
  );

  const visible = useMemo(() => {
    const list = lowOnly
      ? searched.filter((item) => item.onHand < item.parLevel)
      : searched;

    return [...list].sort((a, b) => {
      const bandRank = (onHand: number, par: number) => {
        const band = stockBand(onHand, par);
        return band === "critical" ? 0 : band === "low" ? 1 : 2;
      };
      const rankDiff =
        bandRank(a.onHand, a.parLevel) - bandRank(b.onHand, b.parLevel);
      if (rankDiff !== 0) return rankDiff;
      const categoryCmp = a.category.localeCompare(b.category);
      if (categoryCmp !== 0) return categoryCmp;
      return a.name.localeCompare(b.name);
    });
  }, [searched, lowOnly]);

  const editingItem = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [items, editingId],
  );

  useEffect(() => {
    if (!editingItem) return;
    setOnHandDraft(formatQty(editingItem.onHand));
    setUnitDraft(editingItem.unit);
    setEditError(null);
  }, [editingItem]);

  const editUnitOptions = useMemo(
    () => unitOptionsFor(editingItem?.unit ?? unitDraft),
    [editingItem?.unit, unitDraft],
  );

  const tableMinWidth = showBranchFilter ? "min-w-[42rem]" : "min-w-[34rem]";
  const emptyMessage = query.trim()
    ? "No items match that search."
    : lowOnly
      ? "Everything is at or above target."
      : "No purchased stock yet. Record a purchase to add items.";

  function openEditor(item: InventoryItem) {
    setEditingId(item.id);
    setOnHandDraft(formatQty(item.onHand));
    setUnitDraft(item.unit);
    setEditError(null);
  }

  function closeEditor() {
    setEditingId(null);
    setOnHandDraft("");
    setUnitDraft("pcs");
    setEditError(null);
  }

  function saveStock() {
    if (!editingItem || !canAdjust) return;
    const parsed = Number(onHandDraft.trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditError("Enter a valid quantity of 0 or more.");
      return;
    }
    if (!unitDraft.trim()) {
      setEditError("Choose a unit.");
      return;
    }
    updateInventoryStock(editingItem.id, {
      onHand: parsed,
      unit: unitDraft.trim(),
    });
    closeEditor();
  }

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

      <section className="mb-4 rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-[14rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items or categories"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2"
            />
          </div>

          {showBranchFilter ? (
            <div className="w-full sm:w-56">
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

          <div
            className="inline-flex w-fit flex-wrap gap-1 rounded-md bg-slate-100 p-1"
            role="tablist"
            aria-label="Stock filter"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!lowOnly}
              onClick={() => setLowOnly(false)}
              className={`min-h-9 rounded px-2.5 text-sm font-semibold transition ${
                !lowOnly
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All
              <span
                className={`ml-1.5 tabular-nums ${
                  !lowOnly ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {searched.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lowOnly}
              onClick={() => setLowOnly(true)}
              className={`min-h-9 rounded px-2.5 text-sm font-semibold transition ${
                lowOnly
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Below target
              <span
                className={`ml-1.5 tabular-nums ${
                  lowOnly ? "text-rose-600" : "text-slate-400"
                }`}
              >
                {belowCount}
              </span>
            </button>
          </div>

          <p className="shrink-0 text-sm text-slate-500 sm:ml-auto">
            Showing{" "}
            <span className="font-semibold text-slate-700 tabular-nums">
              {visible.length}
            </span>{" "}
            {visible.length === 1 ? "item" : "items"}
          </p>
        </div>
      </section>

      <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
        {visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            {emptyMessage}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full ${tableMinWidth} border-collapse text-left`}>
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Item
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Category
                  </th>
                  {showBranchFilter ? (
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Branch
                    </th>
                  ) : null}
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-semibold"
                  >
                    On hand
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-semibold"
                  >
                    Target
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right font-semibold"
                  >
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const band = stockBand(item.onHand, item.parLevel);
                  const branchName =
                    branchNameById.get(item.branchId) ?? "—";

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 align-middle">
                        <p className="font-semibold text-slate-900">
                          {item.name}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-middle text-sm text-slate-600">
                        {item.category}
                      </td>
                      {showBranchFilter ? (
                        <td className="max-w-[9rem] truncate px-3 py-3 align-middle text-sm text-slate-600">
                          {branchName}
                        </td>
                      ) : null}
                      <td className="px-3 py-3 text-right align-middle">
                        <p className="font-semibold tabular-nums text-slate-900">
                          {formatQty(item.onHand)}
                        </p>
                        <p className="text-xs text-slate-400">{item.unit}</p>
                      </td>
                      <td className="px-3 py-3 text-right align-middle text-sm tabular-nums text-slate-600">
                        {formatQty(item.parLevel)}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <StatusPill band={band} />
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <button
                          type="button"
                          disabled={!canAdjust}
                          onClick={() => openEditor(item)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-[transform,background-color] hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PosDialog
        open={editingItem != null}
        title={editingItem ? `Edit ${editingItem.name}` : "Edit stock"}
        onClose={closeEditor}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeEditor}
              className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveStock}
              disabled={!canAdjust}
              className="min-h-11 flex-1 rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header hover:brightness-110 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        }
      >
        {editingItem ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveStock();
            }}
          >
            <p className="text-sm text-slate-500">
              {editingItem.category}
              {showBranchFilter ? (
                <>
                  {" · "}
                  {branchNameById.get(editingItem.branchId) ?? "Branch"}
                </>
              ) : null}
              {" · "}
              target {formatQty(editingItem.parLevel)} {unitDraft}
            </p>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                On hand
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={onHandDraft}
                  onChange={(event) => {
                    setOnHandDraft(event.target.value);
                    setEditError(null);
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm font-semibold tabular-nums outline-none ring-[var(--pos-accent)] focus:ring-2"
                  autoFocus
                />
                <div className="w-[9.5rem] shrink-0">
                  <Select
                    aria-label="Unit"
                    value={unitDraft}
                    options={editUnitOptions}
                    onChange={(value) => {
                      setUnitDraft(value);
                      setEditError(null);
                    }}
                    disabled={!canAdjust}
                  />
                </div>
              </div>
            </label>
            {editError ? (
              <p className="text-sm font-medium text-rose-600">{editError}</p>
            ) : null}
          </form>
        ) : null}
      </PosDialog>
    </ModuleShell>
  );
}
