"use client";

import { useMemo, useState } from "react";
import { Banknote, FileSpreadsheet, Plus, Search } from "lucide-react";
import { PosDialog } from "@/components/pos/PosDialog";
import { formatMoney } from "@/lib/format";
import type { Supplier } from "@/lib/purchases";
import { can } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth-store";
import { usePurchaseStore } from "@/store/purchase-store";

type SuppliersPanelProps = {
  onUseForPurchase?: (supplierId: string) => void;
};

type SupplierBalance = {
  payable: number;
  status: "advance" | "owing" | "settled";
};

const fieldClass =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2";

const labelClass = "mb-1 block text-sm font-medium text-slate-600";

function newSupplierCode(): string {
  return `v-${Date.now()}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function StatusPill({ status }: { status: SupplierBalance["status"] }) {
  if (status === "advance") {
    return (
      <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
        Advance
      </span>
    );
  }
  if (status === "owing") {
    return (
      <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
        Owing
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
      Settled
    </span>
  );
}

export function SuppliersPanel({ onUseForPurchase }: SuppliersPanelProps) {
  const suppliers = usePurchaseStore((state) => state.suppliers);
  const purchases = usePurchaseStore((state) => state.purchases);
  const addSupplier = usePurchaseStore((state) => state.addSupplier);
  const paySupplier = usePurchaseStore((state) => state.paySupplier);
  const role = useAuthStore((state) => state.user?.role);
  const canManage = can(role, "access_purchases");
  const canPay = can(role, "adjust_inventory");

  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftCode, setDraftCode] = useState("");
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState("");

  const balances = useMemo(() => {
    const map = new Map<string, SupplierBalance>();
    for (const supplier of suppliers) {
      map.set(supplier.id, { payable: 0, status: "settled" });
    }
    for (const purchase of purchases) {
      const current = map.get(purchase.supplierId) ?? {
        payable: 0,
        status: "settled" as const,
      };
      const due =
        typeof purchase.due === "number"
          ? purchase.due
          : roundMoney(purchase.total - (purchase.paid ?? 0));
      current.payable = roundMoney(current.payable + due);
      map.set(purchase.supplierId, current);
    }
    for (const [id, balance] of map) {
      map.set(id, {
        payable: balance.payable,
        status:
          balance.payable < 0
            ? "advance"
            : balance.payable > 0
              ? "owing"
              : "settled",
      });
    }
    return map;
  }, [suppliers, purchases]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? suppliers
      : suppliers.filter(
          (supplier) =>
            supplier.name.toLowerCase().includes(q) ||
            supplier.code.toLowerCase().includes(q) ||
            (supplier.contactPerson ?? "").toLowerCase().includes(q) ||
            (supplier.phone ?? "").toLowerCase().includes(q) ||
            (supplier.email ?? "").toLowerCase().includes(q) ||
            (supplier.address ?? "").toLowerCase().includes(q) ||
            (supplier.notes ?? "").toLowerCase().includes(q),
        );

    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, query]);

  function openAdd() {
    setDraftCode(newSupplierCode());
    setName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    setError("");
    setDialogOpen(true);
  }

  function saveSupplier() {
    const result = addSupplier({
      code: draftCode,
      name,
      contactPerson,
      phone,
      email,
      address,
      notes,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDialogOpen(false);
    setSuccessMessage(`Supplier “${result.supplier.name}” created.`);
  }

  function openPay(supplier: Supplier) {
    const balance = balances.get(supplier.id);
    const owing = Math.max(0, balance?.payable ?? 0);
    setPayingSupplier(supplier);
    setPayAmount(owing > 0 ? String(owing) : "");
    setPayError("");
    setPayDialogOpen(true);
  }

  function submitPay() {
    if (!payingSupplier) return;
    const result = paySupplier(payingSupplier.id, Number(payAmount));
    if (!result.ok) {
      setPayError(result.error);
      return;
    }
    setPayDialogOpen(false);
    setSuccessMessage(
      `Payment of ${formatMoney(result.applied)} recorded for ${payingSupplier.name}.`,
    );
  }

  return (
    <div className="space-y-4">
      {successMessage ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {successMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, contact, email, phone…"
            className="min-h-11 w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2"
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canManage}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--pos-header)] px-4 text-sm font-semibold text-pos-on-header hover:brightness-110 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add supplier
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-right">Payable</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  {query.trim()
                    ? "No suppliers match that search."
                    : "No suppliers yet. Add your first vendor."}
                </td>
              </tr>
            ) : (
              filtered.map((supplier) => {
                const balance = balances.get(supplier.id) ?? {
                  payable: 0,
                  status: "settled" as const,
                };
                return (
                  <tr
                    key={supplier.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold text-slate-900">
                        {supplier.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {supplier.address || supplier.code}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold text-slate-900">
                        {supplier.contactPerson || "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {supplier.phone || supplier.email || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-right tabular-nums font-medium text-slate-900">
                      {formatMoney(balance.payable)}
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      <StatusPill status={balance.status} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onUseForPurchase?.(supplier.id)}
                          disabled={!onUseForPurchase || !canManage}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Bill
                        </button>
                        <button
                          type="button"
                          onClick={() => openPay(supplier)}
                          disabled={!canPay}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                        >
                          <Banknote className="h-4 w-4" />
                          Pay
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PosDialog
        open={dialogOpen}
        title="New supplier"
        subtitle={draftCode}
        onClose={() => setDialogOpen(false)}
        className="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveSupplier}
              className="min-h-10 rounded-md bg-[var(--pos-header)] px-4 text-sm font-semibold text-pos-on-header hover:brightness-110"
            >
              Save
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className={labelClass}>Name</span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              autoFocus
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Contact person</span>
            <input
              value={contactPerson}
              onChange={(event) => setContactPerson(event.target.value)}
              className={fieldClass}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className={labelClass}>Phone</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                className={fieldClass}
              />
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>Email</span>
              <input
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                type="email"
                inputMode="email"
                className={fieldClass}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Address</span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2"
            />
          </label>

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
      </PosDialog>

      <PosDialog
        open={payDialogOpen}
        title={payingSupplier ? `Pay ${payingSupplier.name}` : "Pay supplier"}
        onClose={() => setPayDialogOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPayDialogOpen(false)}
              className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitPay}
              className="min-h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Record payment
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {payingSupplier ? (
            <p className="text-sm text-slate-600">
              Current payable:{" "}
              <span className="font-semibold text-slate-900">
                {formatMoney(balances.get(payingSupplier.id)?.payable ?? 0)}
              </span>
            </p>
          ) : null}
          <label className="block">
            <span className={labelClass}>Amount</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={payAmount}
              onChange={(event) => {
                setPayAmount(event.target.value);
                setPayError("");
              }}
              className={`no-spinner ${fieldClass}`}
            />
          </label>
          {payError ? <p className="text-sm text-rose-700">{payError}</p> : null}
        </div>
      </PosDialog>
    </div>
  );
}
