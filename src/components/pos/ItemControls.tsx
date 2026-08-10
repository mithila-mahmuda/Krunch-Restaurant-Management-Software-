"use client";

import { useState, type ReactNode } from "react";
import { Minus, Pencil, Plus, Tag, X } from "lucide-react";
import { activeCurrencySymbol, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { OrderLine } from "@/lib/types";
import { PosDialog } from "@/components/pos/PosDialog";
import { useAuthStore } from "@/store/auth-store";
import { usePosStore } from "@/store/pos-store";

/** Shared with OrderLineList so qty digits line up (near prices, not row center). */
export const orderLineGrid =
  "grid w-full grid-cols-[minmax(0,1fr)_2.5rem_4.25rem_4.25rem] items-start gap-x-2";

type DiscountMode = "amount" | "percent";

export function SelectedLineToolbar({ line }: { line: OrderLine }) {
  const updateQuantity = usePosStore((state) => state.updateQuantity);
  const removeLine = usePosStore((state) => state.removeLine);
  const setLineNote = usePosStore((state) => state.setLineNote);
  const applyLineDiscount = usePosStore((state) => state.applyLineDiscount);
  const setStatusMessage = usePosStore((state) => state.setStatusMessage);
  const role = useAuthStore((state) => state.user?.role);

  const [noteOpen, setNoteOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("amount");
  const [discountValue, setDiscountValue] = useState("");

  const lineTotal = line.unitPrice * line.quantity;
  const maxDiscount = lineTotal;

  const previewAmount = (() => {
    const value = Number.parseFloat(discountValue);
    if (Number.isNaN(value) || value < 0) return 0;
    if (discountMode === "percent") {
      return Math.min(
        lineTotal,
        Math.round(lineTotal * (value / 100) * 100) / 100,
      );
    }
    return Math.min(lineTotal, value);
  })();

  function openDiscount() {
    if (!can(role, "apply_discount")) {
      setStatusMessage("Your role cannot apply discounts.");
      return;
    }
    if (line.manualDiscountAmount > 0 && lineTotal > 0) {
      const asPercent =
        Math.round((line.manualDiscountAmount / lineTotal) * 1000) / 10;
      setDiscountMode("percent");
      setDiscountValue(String(asPercent));
    } else {
      setDiscountMode("amount");
      setDiscountValue("");
    }
    setDiscountOpen(true);
  }

  function applyDiscount() {
    const value = Number.parseFloat(discountValue);
    if (Number.isNaN(value) || value < 0) return;

    if (discountMode === "percent") {
      const percent = Math.min(100, value);
      const amount = Math.round(lineTotal * (percent / 100) * 100) / 100;
      applyLineDiscount(line.id, amount, {
        mode: "percent",
        percent,
      });
    } else {
      applyLineDiscount(line.id, value, { mode: "amount" });
    }
    setDiscountOpen(false);
  }

  return (
    <>
      <div className={`${orderLineGrid} items-end px-3 pb-2.5 pt-1`}>
        <div className="flex items-end justify-start gap-1">
          <ToolbarAction
            label="Note"
            active={Boolean(line.note)}
            onClick={() => {
              setNoteValue(line.note ?? "");
              setNoteOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" strokeWidth={2.25} />
          </ToolbarAction>

          <ToolbarAction
            label="Discount"
            active={line.manualDiscountAmount > 0}
            onClick={openDiscount}
          >
            <Tag className="h-4 w-4" strokeWidth={2.25} />
          </ToolbarAction>
        </div>

        <div className="z-10 flex w-max justify-self-center flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => updateQuantity(line.id, -1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pos-selected-deep)] text-pos-on-selected transition hover:bg-white hover:text-[var(--pos-selected)] active:scale-95"
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <span className="flex h-8 w-8 items-center justify-center rounded bg-[var(--pos-selected-deep)] text-base font-bold text-pos-on-selected">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(line.id, 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pos-selected-deep)] text-pos-on-selected transition hover:bg-white hover:text-[var(--pos-selected)] active:scale-95"
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-pos-on-selected/90">
            Quantity
          </span>
        </div>

        <div className="col-span-2 flex items-end justify-end">
          <ToolbarAction label="Delete" onClick={() => removeLine(line.id)}>
            <X className="h-4 w-4" strokeWidth={2.5} />
          </ToolbarAction>
        </div>
      </div>

      <PosDialog
        open={noteOpen}
        title={`Note · ${line.name}`}
        onClose={() => setNoteOpen(false)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setLineNote(line.id, "");
                setNoteOpen(false);
              }}
              className="min-h-11 rounded-md border border-slate-300 text-sm font-semibold hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setLineNote(line.id, noteValue);
                setNoteOpen(false);
              }}
              className="min-h-11 rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header hover:brightness-110"
            >
              Save note
            </button>
          </div>
        }
      >
        <p className="mb-2 text-sm text-slate-500">
          Kitchen / bar instruction for this line.
        </p>
        <textarea
          value={noteValue}
          onChange={(event) => setNoteValue(event.target.value)}
          rows={4}
          autoFocus
          placeholder="e.g. No onions, extra hot"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2"
        />
      </PosDialog>

      <PosDialog
        open={discountOpen}
        title={`Discount · ${line.name}`}
        onClose={() => setDiscountOpen(false)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                applyLineDiscount(line.id, 0);
                setDiscountOpen(false);
              }}
              className="min-h-11 rounded-md border border-slate-300 text-sm font-semibold hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyDiscount}
              className="min-h-11 rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header hover:brightness-110"
            >
              Apply
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-slate-500">
          Line total {formatMoney(lineTotal)}. Max discount{" "}
          {formatMoney(maxDiscount)}.
        </p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setDiscountMode("amount");
              setDiscountValue("");
            }}
            className={`min-h-10 rounded-md text-sm font-semibold ${
              discountMode === "amount"
                ? "bg-[var(--pos-header)] text-pos-on-header"
                : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            {activeCurrencySymbol()} Amount
          </button>
          <button
            type="button"
            onClick={() => {
              setDiscountMode("percent");
              setDiscountValue("");
            }}
            className={`min-h-10 rounded-md text-sm font-semibold ${
              discountMode === "percent"
                ? "bg-[var(--pos-header)] text-pos-on-header"
                : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            % Percent
          </button>
        </div>

        <label className="block text-sm font-semibold">
          {discountMode === "percent"
            ? "Percent (%)"
            : `Amount (${activeCurrencySymbol()})`}
          <input
            type="number"
            min={0}
            step={discountMode === "percent" ? 1 : 0.01}
            max={discountMode === "percent" ? 100 : maxDiscount}
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            autoFocus
            className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2"
          />
        </label>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {(discountMode === "percent" ? [5, 10, 20, 50] : [1, 2, 5, 10]).map(
            (preset) => (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  setDiscountValue(
                    String(
                      discountMode === "percent"
                        ? preset
                        : Math.min(preset, maxDiscount),
                    ),
                  )
                }
                className="min-h-10 rounded-md border border-slate-300 text-sm font-semibold hover:bg-slate-50"
              >
                {discountMode === "percent"
                  ? `${preset}%`
                  : `${activeCurrencySymbol()}${preset}`}
              </button>
            ),
          )}
        </div>

        {previewAmount > 0 ? (
          <p className="mt-3 text-sm font-semibold text-slate-700">
            Discount {formatMoney(previewAmount)}
            {discountMode === "percent" && discountValue
              ? ` (${discountValue}%)`
              : ""}
          </p>
        ) : null}
      </PosDialog>
    </>
  );
}

function ToolbarAction({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-12 flex-col items-center gap-1 text-pos-on-selected transition active:scale-95"
      aria-label={label}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
          active
            ? "bg-white text-[var(--pos-selected)]"
            : "bg-[var(--pos-selected-deep)] text-pos-on-selected group-hover:bg-white group-hover:text-[var(--pos-selected)]"
        }`}
      >
        {children}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide">
        {label}
      </span>
    </button>
  );
}
