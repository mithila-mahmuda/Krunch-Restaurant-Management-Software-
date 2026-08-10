"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { formatMoney } from "@/lib/format";
import {
  orderLineGrid,
  SelectedLineToolbar,
} from "@/components/pos/ItemControls";
import { useOpsStore } from "@/store/ops-store";
import { usePosStore } from "@/store/pos-store";

export function OrderLineList() {
  const lines = usePosStore((state) => state.lines);
  const selectedLineId = usePosStore((state) => state.selectedLineId);
  const selectLine = usePosStore((state) => state.selectLine);
  const getStockShortfalls = usePosStore((state) => state.getStockShortfalls);
  useOpsStore((state) => state.inventory);
  const selectedRowRef = useRef<HTMLLIElement | null>(null);

  const shortfallByProduct = new Map(
    getStockShortfalls().map((item) => [item.productId, item]),
  );

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedLineId, lines.length]);

  if (lines.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-700">No items yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Tap a category, then add products to start an order.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
      <ul>
        {lines.map((line) => {
          const selected = line.id === selectedLineId;
          const gross = line.unitPrice * line.quantity;
          const discountLabel =
            line.promotionLabel ||
            (line.manualDiscountAmount > 0 ? "Discount" : null);
          const discountAmount =
            line.discountAmount > 0 ? line.discountAmount : 0;
          const shortfall = shortfallByProduct.get(line.productId);
          const unitSuffix = shortfall?.unit ? ` ${shortfall.unit}` : "";

          return (
            <li
              key={line.id}
              ref={selected ? selectedRowRef : undefined}
              className={
                selected
                  ? "bg-[var(--pos-selected)] text-pos-on-selected"
                  : "border-b border-slate-100 bg-white text-slate-900"
              }
            >
              <button
                type="button"
                onClick={() => selectLine(selected ? null : line.id)}
                className={`${orderLineGrid} px-3 py-2 text-left text-sm leading-snug transition ${
                  selected ? "text-pos-on-selected" : "hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0">
                  <p
                    className={`truncate font-bold ${
                      selected ? "text-pos-on-selected" : "text-slate-900"
                    }`}
                  >
                    {line.name}
                  </p>
                  {line.note ? (
                    <p
                      className={`truncate text-xs italic ${
                        selected
                          ? "text-pos-on-selected/80"
                          : "text-slate-500"
                      }`}
                    >
                      Note: {line.note}
                    </p>
                  ) : null}
                  {shortfall ? (
                    <p
                      className={`flex min-w-0 items-center gap-1 text-[11px] font-bold ${
                        selected ? "text-[#ffe600]" : "text-[#d4a000]"
                      }`}
                    >
                      <TriangleAlert
                        className="h-3.5 w-3.5 shrink-0"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span className="truncate">
                        Max available {shortfall.available}
                        {unitSuffix}
                      </span>
                    </p>
                  ) : null}
                </div>
                <span
                  className={`text-center font-medium ${
                    selected ? "text-pos-on-selected" : "text-slate-800"
                  }`}
                >
                  {line.quantity}
                </span>
                <span
                  className={`text-right ${
                    selected ? "text-pos-on-selected/90" : "text-slate-700"
                  }`}
                >
                  {formatMoney(line.unitPrice)}
                </span>
                <span
                  className={`text-right font-semibold ${
                    selected ? "text-pos-on-selected" : "text-slate-900"
                  }`}
                >
                  {formatMoney(gross)}
                </span>
              </button>

              {discountLabel ? (
                <div
                  className={`flex items-start justify-between gap-2 px-3 pb-1.5 text-xs ${
                    selected ? "text-pos-on-selected/80" : "text-slate-500"
                  }`}
                >
                  <p className="min-w-0 flex-1 truncate">{discountLabel}</p>
                  {discountAmount > 0 ? (
                    <p className="shrink-0 font-medium">
                      −{formatMoney(discountAmount)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {selected ? <SelectedLineToolbar line={line} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
