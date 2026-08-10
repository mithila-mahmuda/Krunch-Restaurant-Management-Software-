"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Monitor,
  Plus,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  diningOptionLabel,
  formatClockTime,
  formatMoney,
  paymentMethodLabel,
  titleCaseLabel,
} from "@/lib/format";
import type { SidebarTab } from "@/lib/types";
import { useCustomerStore } from "@/store/customer-store";
import { useOpsStore } from "@/store/ops-store";
import { usePosStore } from "@/store/pos-store";
import { useSettingsStore } from "@/store/settings-store";
import { CustomerFormFields } from "@/components/customers/CustomerFormFields";
import { ActionButtons } from "@/components/pos/ActionButtons";
import { OrderLineList } from "@/components/pos/OrderLineList";
import { OrderTotals } from "@/components/pos/OrderTotals";
import { PosDialog } from "@/components/pos/PosDialog";
import { UtilityButtons } from "@/components/pos/UtilityButtons";
import { ReceiptTicket } from "@/components/receipt/ReceiptTicket";

const tabs: {
  id: SidebarTab;
  label: string;
  icon: typeof Monitor;
}[] = [
  { id: "menu", label: "Menu", icon: Monitor },
  { id: "customers", label: "Customers", icon: Users },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "tables", label: "Tabs & Tables", icon: UtensilsCrossed },
];

export function OrderSidebar() {
  const activeTab = usePosStore((state) => state.activeTab);
  const setActiveTab = usePosStore((state) => state.setActiveTab);
  const orderPanelOpen = usePosStore((state) => state.orderPanelOpen);
  const setOrderPanelOpen = usePosStore((state) => state.setOrderPanelOpen);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;

    const media = window.matchMedia("(min-width: 1024px)");

    function syncInert() {
      if (!el) return;
      if (media.matches || orderPanelOpen) {
        el.removeAttribute("inert");
      } else {
        el.setAttribute("inert", "");
      }
    }

    syncInert();
    media.addEventListener("change", syncInert);
    return () => media.removeEventListener("change", syncInert);
  }, [orderPanelOpen]);

  useEffect(() => {
    if (!orderPanelOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"]')) return;
      setOrderPanelOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [orderPanelOpen, setOrderPanelOpen]);

  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 z-30 bg-black/45 transition-opacity lg:hidden ${
          orderPanelOpen
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-label="Close order panel"
        tabIndex={orderPanelOpen ? 0 : -1}
        onClick={() => setOrderPanelOpen(false)}
      />

      <aside
        ref={asideRef}
        className={`pos-light-scroll fixed inset-x-0 bottom-0 z-40 flex max-h-[min(92dvh,100%)] w-full flex-col rounded-t-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl transition-transform duration-200 ease-out @container ${
          orderPanelOpen ? "translate-y-0" : "translate-y-full"
        } lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-[min(100%,400px)] lg:shrink-0 lg:translate-y-0 lg:rounded-none lg:border-0 lg:border-l lg:shadow-none`}
        aria-label="Order panel"
      >
        <div className="shrink-0 border-b border-slate-200 px-3 pb-2 pt-2 lg:hidden">
          <div className="mb-2 flex justify-center">
            <span className="h-1 w-10 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-900">Current order</p>
            <button
              type="button"
              onClick={() => setOrderPanelOpen(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-50 active:scale-95"
              aria-label="Close order panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <TicketContextBar />

        <div className="grid shrink-0 grid-cols-4 border-b border-slate-200 bg-white">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-label={tab.label}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-bold uppercase tracking-wide transition ${
                  active
                    ? "border-b-2 border-[var(--pos-header)] bg-[var(--pos-header)]/10 text-[var(--pos-header)] dark:text-white"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === "menu" ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col">
              <OrderLineList />
            </div>
            <div className="shrink-0 overflow-y-auto overscroll-contain pb-[max(0px,env(safe-area-inset-bottom))]">
              <OrderTotals />
              <UtilityButtons />
              <ActionButtons />
            </div>
          </>
        ) : activeTab === "customers" ? (
          <CustomersQuickPanel />
        ) : activeTab === "orders" ? (
          <OrdersQuickPanel />
        ) : (
          <TablesQuickPanel />
        )}
      </aside>
    </>
  );
}

function TicketContextBar() {
  const customerId = usePosStore((state) => state.customerId);
  const customerName = usePosStore((state) => state.customerName);
  const tableLabel = usePosStore((state) => state.tableLabel);
  const diningOption = usePosStore((state) => state.diningOption);
  const customers = useCustomerStore((state) => state.customers);

  const guestNotes = customerId
    ? customers.find((customer) => customer.id === customerId)?.notes?.trim()
    : undefined;

  if (!customerName && !tableLabel) return null;

  return (
    <div className="shrink-0 border-b border-slate-100 bg-[var(--pos-accent-soft)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--pos-accent)]">
      <p className="truncate">
        {[
          customerName ? `Guest: ${customerName}` : null,
          tableLabel ? `Table ${tableLabel}` : null,
          diningOptionLabel(diningOption),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {guestNotes ? (
        <p className="mt-0.5 truncate font-medium text-amber-800">
          Note: {guestNotes}
        </p>
      ) : null}
    </div>
  );
}

function PanelFooter({ href, label }: { href: string; label: string }) {
  return (
    <div className="shrink-0 border-t border-slate-200 p-3">
      <Link
        href={href}
        className="flex min-h-11 items-center justify-center rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header hover:brightness-110"
      >
        {label}
      </Link>
    </div>
  );
}

function CustomersQuickPanel() {
  const customers = useCustomerStore((state) => state.customers);
  const addCustomer = useCustomerStore((state) => state.addCustomer);
  const customerId = usePosStore((state) => state.customerId);
  const attachCustomer = usePosStore((state) => state.attachCustomer);
  const setActiveTab = usePosStore((state) => state.setActiveTab);

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (customer) =>
          customer.name.toLowerCase().includes(q) ||
          customer.phone.includes(q) ||
          customer.email.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [customers, query]);

  function saveAndAttach() {
    const result = addCustomer({ name, email, phone, notes });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    attachCustomer({
      id: result.customer.id,
      name: result.customer.name,
    });
    setAddOpen(false);
    setActiveTab("menu");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-slate-100 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">Attach a guest</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setName("");
              setEmail("");
              setPhone("");
              setNotes("");
              setAddOpen(true);
            }}
            className="inline-flex min-h-9 items-center gap-1 rounded-md bg-[var(--pos-header)] px-2.5 text-xs font-bold text-pos-on-header"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search guests"
          className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2"
        />
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
        {filtered.map((customer) => {
          const attached = customerId === customer.id;
          return (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => {
                  if (attached) {
                    attachCustomer(null);
                  } else {
                    attachCustomer({ id: customer.id, name: customer.name });
                    setActiveTab("menu");
                  }
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition ${
                  attached
                    ? "bg-[var(--pos-accent-soft)] text-[var(--pos-accent)]"
                    : "hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{customer.name}</span>
                  <span className="block text-xs text-slate-500">
                    {customer.loyaltyPoints} pts · {customer.phone}
                  </span>
                  {customer.notes?.trim() ? (
                    <span className="mt-0.5 block truncate text-xs text-amber-800">
                      {customer.notes.trim()}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs font-bold uppercase">
                  {attached ? "Linked" : "Attach"}
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-slate-500">
            No guests found. Add a new customer.
          </li>
        ) : null}
      </ul>
      <PanelFooter href="/customers" label="Open Customers" />

      <PosDialog
        open={addOpen}
        title="Add customer"
        onClose={() => setAddOpen(false)}
        footer={
          <button
            type="button"
            onClick={saveAndAttach}
            className="min-h-11 w-full rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header"
          >
            Save & attach
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
          onSubmit={saveAndAttach}
        />
      </PosDialog>
    </div>
  );
}

function OrdersQuickPanel() {
  const orders = useOpsStore((state) => state.orders);
  const showDemoSeed = useSettingsStore((state) => state.showDemoSeed);
  const recallOrder = usePosStore((state) => state.recallOrder);
  const loadOpenOrder = usePosStore((state) => state.loadOpenOrder);
  const setStatusMessage = usePosStore((state) => state.setStatusMessage);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptText, setReceiptText] = useState("");

  const heldOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.held &&
          order.status === "open" &&
          (showDemoSeed || order.source === "till"),
      ),
    [orders, showDemoSeed],
  );

  const completedOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            order.status === "paid" &&
            (showDemoSeed || order.source === "till"),
        )
        .slice(0, 8),
    [orders, showDemoSeed],
  );

  const kitchenOpen = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            order.kitchenStatus != null &&
            (showDemoSeed || order.source === "till"),
        )
        .slice(0, 6),
    [orders, showDemoSeed],
  );

  const hasAny =
    heldOrders.length > 0 ||
    completedOrders.length > 0 ||
    kitchenOpen.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-100 p-3">
        <p className="text-sm font-bold text-slate-900">Orders</p>
        <p className="text-xs text-slate-500">
          Held, kitchen, and completed from this till
        </p>
      </div>
      <ul className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
        {heldOrders.length > 0 ? (
          <li className="space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Held
            </p>
            {heldOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  const result = recallOrder(order.id);
                  if (!result.ok) setStatusMessage(result.error);
                }}
                className="w-full rounded-md border border-[var(--pos-accent)] bg-[var(--pos-accent-soft)] px-3 py-2.5 text-left text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {order.number}
                    {order.tableLabel ? (
                      <span className="ml-1 text-slate-500">
                        {order.tableLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="font-bold">{formatMoney(order.total)}</p>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  Held {formatClockTime(order.placedAt)}
                  {order.customerName ? ` · ${order.customerName}` : ""} · Tap
                  to recall
                </p>
              </button>
            ))}
          </li>
        ) : null}

        {kitchenOpen.length > 0 ? (
          <li className="space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              In kitchen
            </p>
            {kitchenOpen.map((order) => (
              <button
                key={order.id}
                type="button"
                disabled={order.status === "paid"}
                onClick={() => {
                  if (order.status === "paid") return;
                  const result = loadOpenOrder(order.id);
                  if (!result.ok) setStatusMessage(result.error);
                }}
                className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-sm disabled:cursor-default"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {order.number}
                    {order.tableLabel ? (
                      <span className="ml-1 text-slate-500">
                        {order.tableLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="font-bold">{formatMoney(order.total)}</p>
                </div>
                <p className="mt-0.5 text-xs text-amber-900">
                  {[
                    order.kitchenStatus === "queued"
                      ? "Open"
                      : order.kitchenStatus
                        ? titleCaseLabel(order.kitchenStatus)
                        : order.status === "paid" || order.status === "ready"
                          ? "Ready"
                          : order.status === "preparing"
                            ? "Preparing"
                            : "Open",
                    order.status === "paid"
                      ? "Paid"
                      : order.status === "void"
                        ? "Void"
                        : "Unpaid",
                    order.status !== "paid" ? "Tap to open on till" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
            ))}
          </li>
        ) : null}

        {completedOrders.length > 0 ? (
          <li className="space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Completed
            </p>
            {completedOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  setReceiptText(
                    useOpsStore.getState().getDisplayReceipt(order.id) ??
                      order.receipt ??
                      "",
                  );
                  setReceiptOpen(true);
                }}
                className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {order.number}
                    {order.tableLabel ? (
                      <span className="ml-1 text-slate-500">
                        {order.tableLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="font-bold">{formatMoney(order.total)}</p>
                </div>
                <p className="mt-0.5 text-xs text-emerald-800">
                  {[
                    `Paid ${formatClockTime(order.paidAt)}`,
                    order.method ? paymentMethodLabel(order.method) : null,
                    order.customerName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
            ))}
          </li>
        ) : null}

        {!hasAny ? (
          <li className="px-3 py-8 text-center text-sm text-slate-500">
            No orders yet. Use Hold, Send Kitchen, or Pay.
          </li>
        ) : null}
      </ul>
      <PanelFooter href="/orders" label="Open Orders board" />

      <PosDialog
        open={receiptOpen}
        title="Completed order"
        onClose={() => setReceiptOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => setReceiptOpen(false)}
            className="min-h-11 w-full rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header"
          >
            Done
          </button>
        }
      >
        <ReceiptTicket receipt={receiptText} />
      </PosDialog>
    </div>
  );
}

function TablesQuickPanel() {
  const tableId = usePosStore((state) => state.tableId);
  const attachTable = usePosStore((state) => state.attachTable);
  const loadTableTab = usePosStore((state) => state.loadTableTab);
  const setActiveTab = usePosStore((state) => state.setActiveTab);
  const setStatusMessage = usePosStore((state) => state.setStatusMessage);
  const tables = useOpsStore((state) => state.tables);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-100 p-3">
        <p className="text-sm font-bold text-slate-900">Assign table</p>
        <p className="text-xs text-slate-500">
          {tableId
            ? `Ticket linked to ${tables.find((t) => t.id === tableId)?.label}`
            : "Tap free to assign, or open an existing tab"}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {(["Main", "Patio", "Bar"] as const).map((zone) => (
          <div key={zone} className="mb-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {zone}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {tables
                .filter((table) => table.zone === zone)
                .map((table) => {
                  const selected = tableId === table.id;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          attachTable(null);
                          return;
                        }
                        if (table.status === "free" || table.status === "seated") {
                          attachTable({ id: table.id, label: table.label });
                          setActiveTab("menu");
                          return;
                        }
                        const result = loadTableTab(table.id);
                        if (!result.ok) setStatusMessage(result.error);
                        else setActiveTab("menu");
                      }}
                      className={`min-h-14 rounded-md border text-xs font-bold transition ${
                        selected
                          ? "border-[var(--pos-accent)] bg-[var(--pos-accent-soft)] text-[var(--pos-accent)]"
                          : table.status === "free"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-amber-200 bg-amber-50 text-amber-950"
                      }`}
                    >
                      {table.label}
                      <span className="mt-0.5 block text-[9px] font-semibold uppercase opacity-70">
                        {table.status}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <PanelFooter href="/tables" label="Open floor plan" />
    </div>
  );
}
