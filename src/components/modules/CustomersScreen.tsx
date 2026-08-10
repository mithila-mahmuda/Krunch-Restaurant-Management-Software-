"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import {
  CustomerFormFields,
  isPlaceholderEmail,
  isPlaceholderPhone,
} from "@/components/customers/CustomerFormFields";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { PosDialog } from "@/components/pos/PosDialog";
import {
  diningOptionLabel,
  formatClockTime,
  formatMoney,
} from "@/lib/format";
import type { OpsOrder } from "@/lib/types";
import { useCustomerStore } from "@/store/customer-store";
import { useOpsStore } from "@/store/ops-store";
import { usePosStore } from "@/store/pos-store";
import { useSettingsStore } from "@/store/settings-store";

const PAGE_SIZE = 10;
const HISTORY_LIMIT = 6;

function orderTimestamp(order: OpsOrder): string {
  return order.paidAt ?? order.placedAt;
}

function formatOrderWhen(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return formatClockTime(value);
  const date = new Date(parsed);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return formatClockTime(value);
  }
  return `${date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} ${formatClockTime(value)}`;
}

function orderItemsSummary(order: OpsOrder): string {
  return order.lines
    .slice(0, 3)
    .map((line) => `${line.quantity}× ${line.name}`)
    .join(", ");
}

export function CustomersScreen() {
  const customers = useCustomerStore((state) => state.customers);
  const addCustomer = useCustomerStore((state) => state.addCustomer);
  const updateCustomer = useCustomerStore((state) => state.updateCustomer);
  const orders = useOpsStore((state) => state.orders);
  const showDemoSeed = useSettingsStore((state) => state.showDemoSeed);
  const attachCustomer = usePosStore((state) => state.attachCustomer);
  const attachedId = usePosStore((state) => state.customerId);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        customer.phone.includes(q),
    );
  }, [customers, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);

  const selected =
    filtered.find((customer) => customer.id === selectedId) ??
    filtered[0] ??
    null;

  const recentOrders = useMemo(() => {
    if (!selected) return [];
    return orders
      .filter(
        (order) =>
          !order.held &&
          order.status !== "void" &&
          (showDemoSeed || order.source === "till") &&
          (order.customerId === selected.id ||
            (!order.customerId &&
              order.customerName?.toLowerCase() ===
                selected.name.toLowerCase())),
      )
      .sort(
        (a, b) =>
          Date.parse(orderTimestamp(b)) - Date.parse(orderTimestamp(a)),
      )
      .slice(0, HISTORY_LIMIT);
  }, [orders, selected, showDemoSeed]);

  const isEditing = editingId !== null;
  const phoneLabel = selected && !isPlaceholderPhone(selected.phone)
    ? selected.phone
    : null;
  const emailLabel = selected && !isPlaceholderEmail(selected.email)
    ? selected.email
    : null;

  function resetForm() {
    setError("");
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
  }

  function openAdd() {
    resetForm();
    setEditingId(null);
    setEditorOpen(true);
  }

  function openEdit() {
    if (!selected) return;
    setError("");
    setName(selected.name);
    setEmail(isPlaceholderEmail(selected.email) ? "" : selected.email);
    setPhone(isPlaceholderPhone(selected.phone) ? "" : selected.phone);
    setNotes(selected.notes ?? "");
    setEditingId(selected.id);
    setEditorOpen(true);
  }

  function saveCustomer() {
    const result = isEditing
      ? updateCustomer(editingId, { name, email, phone, notes })
      : addCustomer({ name, email, phone, notes });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const nextId = result.customer.id;
    setSelectedId(nextId);
    setEditorOpen(false);

    const q = query.trim().toLowerCase();
    const nextList = useCustomerStore.getState().customers.filter(
      (customer) =>
        !q ||
        customer.name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        customer.phone.includes(q),
    );
    const index = nextList.findIndex((customer) => customer.id === nextId);
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE) + 1);
  }

  return (
    <ModuleShell title="Customers">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, or phone"
            className="min-h-11 w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2"
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--pos-header)] px-4 text-sm font-semibold text-pos-on-header hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Add customer
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-2">
          {filtered.length > 0 ? (
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Name</span>
              <span>Phone</span>
              <span className="text-right">Points</span>
            </div>
          ) : null}
          {pageItems.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => setSelectedId(customer.id)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                selected?.id === customer.id
                  ? "border-[var(--pos-accent)] bg-[var(--pos-accent-soft)]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-3">
                <p className="truncate font-bold">{customer.name}</p>
                <p className="truncate text-sm text-slate-500">
                  {isPlaceholderPhone(customer.phone)
                    ? "No phone"
                    : customer.phone}
                </p>
                <p className="text-right text-sm font-semibold text-[var(--pos-accent)] tabular-nums">
                  {customer.loyaltyPoints} pts
                </p>
              </div>
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              {customers.length === 0
                ? "No customers yet. Add your first guest."
                : "No customers match that search."}
            </p>
          ) : null}
          {filtered.length > 0 ? (
            <div className="flex items-center justify-between gap-3 px-1 pt-1">
              <p className="text-sm text-slate-500">
                {rangeStart}–{rangeEnd} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-16 px-2 text-center text-sm font-medium text-slate-600 tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          {selected ? (
            <>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold">
                {selected.name}
              </p>
              <div className="mt-1 space-y-0.5 text-sm text-slate-500">
                {phoneLabel ? <p>{phoneLabel}</p> : null}
                {emailLabel ? <p>{emailLabel}</p> : null}
                {!phoneLabel && !emailLabel ? (
                  <p>No contact details</p>
                ) : null}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-slate-50 p-3">
                  <dt className="text-slate-500">Visits</dt>
                  <dd className="text-lg font-bold">{selected.visits}</dd>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <dt className="text-slate-500">Loyalty</dt>
                  <dd className="text-lg font-bold">
                    {selected.loyaltyPoints}
                  </dd>
                </div>
                <div className="col-span-2 rounded-md bg-slate-50 p-3">
                  <dt className="text-slate-500">Last visit</dt>
                  <dd className="font-semibold">{selected.lastVisit}</dd>
                </div>
              </dl>
              {selected.notes ? (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {selected.notes}
                </p>
              ) : null}

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recent orders
                </p>
                {recentOrders.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {recentOrders.map((order) => (
                      <li
                        key={order.id}
                        className="rounded-md border border-slate-200 px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {order.number}
                              <span className="ml-1.5 text-xs font-medium text-slate-500">
                                {order.status === "paid" ? "Paid" : "Open"}
                              </span>
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {formatOrderWhen(orderTimestamp(order))}
                              {" · "}
                              {diningOptionLabel(order.diningOption)}
                              {order.tableLabel
                                ? ` · Table ${order.tableLabel}`
                                : ""}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold tabular-nums">
                            {formatMoney(order.total)}
                          </p>
                        </div>
                        {order.lines.length > 0 ? (
                          <p className="mt-1 truncate text-xs text-slate-600">
                            {orderItemsSummary(order)}
                            {order.lines.length > 3
                              ? ` +${order.lines.length - 3} more`
                              : ""}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
                    No orders linked yet. Attach this guest on the till to
                    start a history.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  attachCustomer(
                    attachedId === selected.id
                      ? null
                      : { id: selected.id, name: selected.name },
                  )
                }
                className="mt-5 min-h-11 w-full rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header hover:brightness-110"
              >
                {attachedId === selected.id
                  ? "Attached to ticket"
                  : "Attach to current ticket"}
              </button>
              <button
                type="button"
                onClick={openEdit}
                className="mt-2 min-h-11 w-full rounded-md border border-slate-300 text-sm font-semibold hover:bg-slate-50"
              >
                Edit profile
              </button>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">
              Select a customer.
            </p>
          )}
        </aside>
      </div>

      <PosDialog
        open={editorOpen}
        title={isEditing ? "Edit customer" : "Add customer"}
        onClose={() => setEditorOpen(false)}
        footer={
          <button
            type="button"
            onClick={saveCustomer}
            className="min-h-11 w-full rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header"
          >
            {isEditing ? "Save changes" : "Save customer"}
          </button>
        }
      >
        <CustomerFormFields
          name={name}
          email={email}
          phone={phone}
          notes={notes}
          error={error}
          onNameChange={setName}
          onEmailChange={setEmail}
          onPhoneChange={setPhone}
          onNotesChange={setNotes}
          onSubmit={saveCustomer}
        />
      </PosDialog>
    </ModuleShell>
  );
}
