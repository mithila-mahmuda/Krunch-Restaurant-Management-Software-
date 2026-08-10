"use client";

import { create } from "zustand";
import {
  demoBranchForServer,
  inventoryForBranches,
  normalizeInventory,
  normalizeTables,
  scopedTableId,
  tablesForBranches,
} from "@/lib/branch-ops";
import {
  DEMO_TABLES,
  INITIAL_CUSTOMERS,
  INITIAL_KITCHEN,
  INITIAL_ORDERS,
  type FloorTable,
  type InventoryItem,
  type KitchenTicket,
  type TicketOrder,
  type TicketStatus,
} from "@/lib/module-data";
import { products as catalogProducts } from "@/lib/mock-data";
import { loadOpsSnapshot, saveOpsSnapshot } from "@/lib/db/repos";
import { queueDbWrite } from "@/lib/db/write";
import { formatMoney } from "@/lib/format";
import { computeTotals } from "@/lib/order-math";
import {
  buildReceiptData,
  isStructuredReceipt,
  resolveReceiptBrand,
  serializeReceipt,
} from "@/lib/receipt";
import {
  commitInventoryForLines,
  restoreInventory,
} from "@/lib/inventory-stock";
import { SEED_BRANCH_IDS } from "@/lib/seed-locations";
import { DEMO_RESTAURANT_ID } from "@/lib/tenant";
import type {
  CashDrawerEvent,
  CashEventType,
  DiningOption,
  KitchenStatus,
  OpsOrder,
  OrderLine,
  PaymentResult,
} from "@/lib/types";
import { assertCan } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth-store";
import { useCatalogStore } from "@/store/catalog-store";
import { useCustomerStore } from "@/store/customer-store";
import { useSettingsStore } from "@/store/settings-store";

function catalogProductsForStock() {
  return useCatalogStore.getState().products;
}

function activeBranchIds(): string[] {
  return useSettingsStore
    .getState()
    .branches.filter((branch) => !branch.archived)
    .map((branch) => branch.id);
}

function branchNameById(branchId: string): string {
  return (
    useSettingsStore
      .getState()
      .branches.find((branch) => branch.id === branchId)?.name ?? branchId
  );
}

interface OpsPersisted {
  orders: OpsOrder[];
  tables: FloorTable[];
  inventory: InventoryItem[];
  nextOrderNumber: number;
  floatAmount: number;
  cashEvents: CashDrawerEvent[];
}

interface TicketInput {
  lines: OrderLine[];
  diningOption: DiningOption;
  serviceEnabled: boolean;
  customerId: string | null;
  customerName: string | null;
  tableId: string | null;
  tableLabel: string | null;
}

interface OpsState extends OpsPersisted {
  restaurantId: string | null;
  hydrated: boolean;
  hydrateForRestaurant: (restaurantId: string) => Promise<void>;
  hydrate: () => Promise<void>;
  persist: () => void;
  /** Rewrite plain-text receipts to the structured ticket format. */
  upgradeLegacyReceipts: () => void;
  getDisplayReceipt: (orderId: string) => string | null;
  holdOrder: (
    input: TicketInput,
  ) => { ok: true; order: OpsOrder } | { ok: false; error: string };
  /** Persist a never-sent till ticket as voided (audit), then caller clears till. */
  voidDraftTicket: (
    input: TicketInput,
  ) => { ok: true; order: OpsOrder } | { ok: false; error: string };
  fireOrder: (
    input: TicketInput,
  ) => { ok: true; order: OpsOrder } | { ok: false; error: string };
  completePayment: (
    input: TicketInput & {
      payment: PaymentResult;
      existingOrderId?: string | null;
    },
  ) =>
    | {
        ok: true;
        order: OpsOrder;
        receipt: string;
        change: number;
        firedToKitchen: boolean;
      }
    | { ok: false; error: string };
  replaceOpenOrder: (
    orderId: string,
    input: TicketInput & { fireToKitchen?: boolean },
  ) => { ok: true; order: OpsOrder } | { ok: false; error: string };
  recallHeldOrder: (
    orderId: string,
  ) => { ok: true; order: OpsOrder } | { ok: false; error: string };
  openTableTab: (
    tableId: string,
  ) => { ok: true; order: OpsOrder } | { ok: false; error: string };
  updateOrderStatus: (
    orderId: string,
    status: TicketStatus,
  ) => { ok: true } | { ok: false; error: string };
  advanceKitchen: (
    orderId: string,
  ) => { ok: true } | { ok: false; error: string };
  setKitchenStatus: (
    orderId: string,
    status: KitchenStatus,
  ) => { ok: true } | { ok: false; error: string };
  seatTable: (tableId: string) => void;
  setTableBill: (tableId: string) => void;
  freeTable: (tableId: string) => void;
  attachTableToActive: (
    tableId: string | null,
    tableLabel: string | null,
  ) => void;
  adjustInventory: (itemId: string, delta: number) => void;
  recordNoSale: (
    reason?: string,
  ) => { ok: true; event: CashDrawerEvent } | { ok: false; error: string };
  recordPettyCash: (
    amount: number,
    reason: string,
  ) => { ok: true; event: CashDrawerEvent } | { ok: false; error: string };
  adjustFloat: (
    amount: number,
  ) => { ok: true; event: CashDrawerEvent } | { ok: false; error: string };
  getTicketOrders: () => TicketOrder[];
  getKitchenTickets: () => KitchenTicket[];
  getHeldOrders: () => OpsOrder[];
  getPaidOrders: () => OpsOrder[];
  getCashEvents: (limit?: number) => CashDrawerEvent[];
  loadDemoSeed: () => void;
  clearDemoSeed: () => void;
  /** Ensure floor plan + inventory rows exist for these branches. */
  ensureBranchAssets: (branchIds: string[]) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Convert demo HH:MM clock times into ISO on a relative day. */
function clockToIso(time: string, dayOffset = 0): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + dayOffset);
  if (match) {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }
  return date.toISOString();
}

/** Resolve a kitchen start timestamp, backfilling older persisted rows. */
function resolveKitchenStartedAt(order: {
  kitchenStatus: KitchenStatus | null;
  kitchenStartedAt?: string | null;
  kitchenElapsedMinutes?: number;
}): string | null {
  if (!order.kitchenStatus) return null;
  if (order.kitchenStartedAt) return order.kitchenStartedAt;
  const offsetMs = (order.kitchenElapsedMinutes ?? 0) * 60_000;
  return new Date(Date.now() - offsetMs).toISOString();
}

function buildReceipt(
  order: OpsOrder,
  payment?: PaymentResult & { change: number },
): string {
  const brand = resolveReceiptBrand();

  return serializeReceipt(
    buildReceiptData({
      lines: order.lines,
      diningOption: order.diningOption,
      serviceEnabled: order.serviceEnabled,
      orderNumber: order.number,
      tableLabel: order.tableLabel,
      customerName: order.customerName,
      server: order.server,
      orderedAt: order.placedAt || order.paidAt || new Date(),
      payment,
      restaurantName: brand.restaurantName,
      phone: brand.phone,
      addressLines: brand.addressLines,
      logoDataUrl: brand.logoDataUrl,
    }),
  );
}

function paymentFromOrder(
  order: OpsOrder,
): (PaymentResult & { change: number }) | undefined {
  if (order.status !== "paid") return undefined;
  return {
    method: order.method ?? "card",
    amountPaid: order.total,
    change: 0,
  };
}

/** Build a live Bill / Receipt for any order with lines. */
function displayReceiptFor(order: OpsOrder): string | undefined {
  if (order.status === "void" || order.lines.length === 0) {
    return undefined;
  }

  return buildReceipt(order, paymentFromOrder(order));
}

function upgradeLegacyReceipts(
  orders: OpsOrder[],
): { orders: OpsOrder[]; changed: boolean } {
  let changed = false;
  const next = orders.map((order) => {
    if (order.status !== "paid") return order;
    if (order.receipt && isStructuredReceipt(order.receipt)) return order;

    const receipt = displayReceiptFor(order);
    if (!receipt || receipt === order.receipt) return order;
    changed = true;
    return { ...order, receipt };
  });
  return { orders: changed ? next : orders, changed };
}

function kitchenStatusToTicket(status: KitchenStatus | null): TicketStatus {
  if (status === "preparing") return "preparing";
  if (status === "ready" || status === "served") return "ready";
  return "open";
}

const ACTIVE_KITCHEN: KitchenStatus[] = ["queued", "preparing", "ready"];

function ticketStatusToKitchen(status: TicketStatus): KitchenStatus | null {
  if (status === "preparing") return "preparing";
  if (status === "ready") return "ready";
  if (status === "open") return "queued";
  return null;
}

/** Keep board status and kitchen stage aligned — same food, one progress. */
function syncFoodStatus(order: OpsOrder): OpsOrder {
  if (order.status === "paid" || order.status === "void") {
    return order;
  }

  if (order.kitchenStatus) {
    const aligned = kitchenStatusToTicket(order.kitchenStatus);
    if (order.status === aligned) return order;
    return { ...order, status: aligned };
  }

  const kitchen = ticketStatusToKitchen(order.status);
  if (kitchen === order.kitchenStatus) return order;
  return {
    ...order,
    kitchenStatus: kitchen,
    kitchenStartedAt: kitchen
      ? order.kitchenStartedAt ?? nowIso()
      : null,
  };
}

const DEMO_DAY_OFFSET: Record<string, number> = {
  "ord-1026": -2,
  "ord-1027": -2,
  "ord-1028": -1,
  "ord-1029": -1,
  "ord-1030": -1,
  "ord-1031": -1,
  "ord-1032": -1,
  "ord-1033": -1,
};

function productByName(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    catalogProducts.find(
      (product) => product.name.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

function customerByGuestName(guestName?: string) {
  if (!guestName) return null;
  const normalized = guestName.trim().toLowerCase();
  return (
    INITIAL_CUSTOMERS.find(
      (customer) =>
        customer.name.trim().toLowerCase() === normalized ||
        customer.name.trim().toLowerCase().startsWith(normalized),
    ) ?? null
  );
}

function demoOrdersToOps(): OpsOrder[] {
  const kitchenByOrder = new Map(
    INITIAL_KITCHEN.map((ticket) => [ticket.orderId, ticket]),
  );

  return INITIAL_ORDERS.map((ticket) => {
    const kitchen = kitchenByOrder.get(ticket.id);
    const dayOffset = DEMO_DAY_OFFSET[ticket.id] ?? 0;
    const customer = customerByGuestName(ticket.guestName);
    const branchId = demoBranchForServer(ticket.server);
    const lines = ticket.items.map((item, index) => {
      const product = productByName(item.name);
      return {
        id: `${ticket.id}-line-${index}`,
        productId: product?.id ?? item.name.toLowerCase().replace(/\s+/g, "-"),
        name: product?.name ?? item.name,
        unitPrice: product?.price ?? ticket.total / Math.max(1, ticket.items.length),
        quantity: item.quantity,
        manualDiscountAmount: 0,
        discountAmount: 0,
      };
    });
    const lineTotal = computeTotals(lines, false).total;
    const localTable =
      ticket.table?.toLowerCase().replace(/\s+/g, "") ?? null;

    return {
      id: ticket.id,
      number: ticket.number,
      lines,
      diningOption: ticket.channel,
      serviceEnabled: false,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? ticket.guestName ?? null,
      tableId: localTable ? scopedTableId(branchId, localTable) : null,
      tableLabel: ticket.table ?? null,
      status: ticket.status,
      kitchenStatus: kitchen?.status ?? null,
      kitchenNotes: kitchen?.notes,
      kitchenStartedAt: kitchen
        ? new Date(Date.now() - kitchen.elapsedMinutes * 60_000).toISOString()
        : null,
      kitchenElapsedMinutes: kitchen?.elapsedMinutes ?? 0,
      server: ticket.server,
      placedAt: clockToIso(ticket.placedAt, dayOffset),
      paidAt:
        ticket.status === "paid"
          ? clockToIso(ticket.placedAt, dayOffset)
          : undefined,
      method: ticket.method,
      total: Math.round(lineTotal * 100) / 100 || ticket.total,
      source: "demo" as const,
      branchId,
      branchName: branchNameById(branchId),
      inventoryDeducted: ticket.status === "paid",
      held: ticket.status === "open" && !kitchen,
    };
  });
}

function syncTablesFromOrders(
  tables: FloorTable[],
  orders: OpsOrder[],
): FloorTable[] {
  const openByTable = new Map<string, OpsOrder>();
  for (const order of orders) {
    if (
      order.tableId &&
      order.status !== "paid" &&
      order.status !== "void"
    ) {
      openByTable.set(order.tableId, order);
    }
  }

  return tables.map((table) => {
    const order = openByTable.get(table.id);
    if (!order) {
      if (table.status === "seated") {
        return {
          ...table,
          openTotal: undefined,
          activeOrderId: null,
        };
      }
      return {
        ...table,
        status: "free" as const,
        openTotal: undefined,
        activeOrderId: null,
        server: undefined,
        guestCount: undefined,
      };
    }

    return {
      ...table,
      status: order.status === "ready" ? ("bill" as const) : ("ordered" as const),
      openTotal: order.total,
      server: order.server,
      activeOrderId: order.id,
      guestCount: table.guestCount ?? 2,
    };
  });
}

function recordLoyalty(customerId: string | null, total: number) {
  if (!customerId) return;
  useCustomerStore.getState().recordVisit(customerId, total);
}

function playKitchenSound() {
  if (!useSettingsStore.getState().kitchenSound) return;
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.12);
    window.setTimeout(() => void ctx.close(), 200);
  } catch {
    // Audio unavailable — ignore.
  }
}

function kitchenNotesFromLines(lines: OrderLine[]): string | undefined {
  const notes = lines
    .filter((line) => line.note)
    .map((line) => `${line.name}: ${line.note}`)
    .join("; ");
  return notes || undefined;
}

/** Line notes plus guest profile notes (allergies / prefs) for the KDS. */
function resolveKitchenNotes(
  customerId: string | null,
  lines: OrderLine[],
): string | undefined {
  const guestNotes = customerId
    ? useCustomerStore
        .getState()
        .customers.find((customer) => customer.id === customerId)
        ?.notes?.trim()
    : undefined;
  const lineNotes = kitchenNotesFromLines(lines);
  const parts = [
    guestNotes ? `Guest: ${guestNotes}` : null,
    lineNotes,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : undefined;
}

/**
 * Payment and kitchen are independent: paying must not mark food ready.
 * Fire to KDS as queued when the ticket has never been kitchened; preserve
 * an active ticket; leave alone if kitchen already finished (bumped).
 */
function resolveKitchenOnPayment(existing?: OpsOrder): {
  kitchenStatus: KitchenStatus | null;
  kitchenStartedAt: string | null;
  kitchenElapsedMinutes: number;
  newlyFired: boolean;
} {
  if (existing?.kitchenStatus) {
    return {
      kitchenStatus: existing.kitchenStatus,
      kitchenStartedAt: existing.kitchenStartedAt ?? nowIso(),
      kitchenElapsedMinutes: existing.kitchenElapsedMinutes ?? 0,
      newlyFired: false,
    };
  }

  if (existing?.status === "ready" || existing?.kitchenStatus === "served") {
    return {
      kitchenStatus: existing.kitchenStatus === "served" ? "served" : null,
      kitchenStartedAt: null,
      kitchenElapsedMinutes: 0,
      newlyFired: false,
    };
  }

  return {
    kitchenStatus: "queued",
    kitchenStartedAt: nowIso(),
    kitchenElapsedMinutes: 0,
    newlyFired: true,
  };
}

function defaultState(): OpsPersisted {
  const branchIds = Object.values(SEED_BRANCH_IDS);
  return {
    orders: [],
    tables: tablesForBranches(branchIds),
    inventory: inventoryForBranches(branchIds),
    nextOrderNumber: 1100,
    floatAmount: 150,
    cashEvents: [],
  };
}

const MAX_CASH_EVENTS = 200;

function appendCashEvent(
  events: CashDrawerEvent[],
  event: CashDrawerEvent,
): CashDrawerEvent[] {
  return [event, ...events].slice(0, MAX_CASH_EVENTS);
}

function activeLocationStamp(): {
  branchId: string;
  branchName: string;
  tillId: string;
  tillName: string;
} {
  const settings = useSettingsStore.getState();
  const branch = settings.getActiveBranch();
  const till = settings.getActiveTill();
  return {
    branchId: branch.id,
    branchName: branch.name,
    tillId: till.id,
    tillName: till.name,
  };
}

function createCashEvent(input: {
  type: CashEventType;
  amount: number;
  reason: string;
  floatAfter: number;
  orderNumber?: string;
}): CashDrawerEvent {
  const staffName = useAuthStore.getState().user?.name ?? "Staff";
  const location = activeLocationStamp();
  return {
    id: `cash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: input.type,
    amount: Math.round(input.amount * 100) / 100,
    reason: input.reason.trim(),
    staffName,
    createdAt: nowIso(),
    floatAfter: Math.round(input.floatAfter * 100) / 100,
    orderNumber: input.orderNumber,
    branchId: location.branchId,
    branchName: location.branchName,
    tillId: location.tillId,
    tillName: location.tillName,
  };
}

export const useOpsStore = create<OpsState>((set, get) => ({
  ...defaultState(),
  restaurantId: null,
  hydrated: false,

  hydrateForRestaurant: async (restaurantId) => {
    if (get().hydrated && get().restaurantId === restaurantId) return;

    const stored = await loadOpsSnapshot(restaurantId);
    const isDemo = restaurantId === DEMO_RESTAURANT_ID;
    const base = defaultState();
    // New restaurants start empty; demo keeps sample orders when unset.
    const seedOrders = isDemo ? base.orders : [];
    const seedTables = isDemo ? base.tables : [];
    const seedInventory = isDemo ? base.inventory : [];
    const rawOrders = (stored?.orders ?? seedOrders).map((order) => ({
      ...order,
      kitchenStartedAt: resolveKitchenStartedAt(order),
    }));
    const loadedOrders = rawOrders.map(syncFoodStatus);
    const syncedChanged = loadedOrders.some((order, index) => {
      const before = rawOrders[index];
      return (
        order.status !== before.status ||
        order.kitchenStatus !== before.kitchenStatus
      );
    });
    const { orders, changed } = upgradeLegacyReceipts(loadedOrders);
    const branchIds = activeBranchIds();
    const normalizedTables = normalizeTables(
      stored?.tables?.length ? stored.tables : seedTables,
      branchIds,
    );
    const normalizedInventory = normalizeInventory(
      stored?.inventory?.length ? stored.inventory : seedInventory,
      branchIds,
    );
    const remappedOrders = orders.map((order) => {
      if (!order.tableId || order.tableId.includes(":")) return order;
      const branchId = order.branchId ?? normalizedTables.tables[0]?.branchId;
      if (!branchId) return order;
      return {
        ...order,
        tableId: scopedTableId(branchId, order.tableId),
      };
    });
    set({
      restaurantId,
      orders: remappedOrders,
      tables: syncTablesFromOrders(normalizedTables.tables, remappedOrders),
      inventory: normalizedInventory.inventory,
      nextOrderNumber: stored?.nextOrderNumber ?? (isDemo ? base.nextOrderNumber : 1001),
      floatAmount: stored?.floatAmount ?? (isDemo ? base.floatAmount : 0),
      cashEvents: stored?.cashEvents ?? [],
      hydrated: true,
    });

    // Seed empty DB with default floor/inventory tables so RDS-shaped rows exist.
    if (
      !stored ||
      changed ||
      syncedChanged ||
      normalizedTables.changed ||
      normalizedInventory.changed
    ) {
      get().persist();
    }
  },

  hydrate: async () => {
    await get().hydrateForRestaurant(get().restaurantId ?? DEMO_RESTAURANT_ID);
  },

  upgradeLegacyReceipts: () => {
    const state = get();
    const { orders, changed } = upgradeLegacyReceipts(state.orders);
    if (!changed) return;
    set({ orders });
    if (state.hydrated) get().persist();
  },

  getDisplayReceipt: (orderId) => {
    const state = get();
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) return null;
    return displayReceiptFor(order) ?? null;
  },

  persist: () => {
    if (!get().hydrated) return;

    const state = get();
    const restaurantId = state.restaurantId;
    if (!restaurantId) return;
    queueDbWrite(
      () =>
        saveOpsSnapshot(restaurantId, {
          orders: state.orders,
          tables: state.tables,
          inventory: state.inventory,
          nextOrderNumber: state.nextOrderNumber,
          floatAmount: state.floatAmount,
          cashEvents: state.cashEvents,
        }),
      "save ops",
    );
  },

  holdOrder: (input) => {
    if (input.lines.length === 0) {
      return { ok: false, error: "Add items before holding an order." };
    }

    const totals = computeTotals(input.lines, input.serviceEnabled);
    const state = get();
    const number = `#${state.nextOrderNumber}`;
    const server = useAuthStore.getState().user?.name ?? "Staff";
    const location = activeLocationStamp();

    const order: OpsOrder = {
      id: `hold-${Date.now().toString(36)}`,
      number,
      lines: input.lines.map((line) => ({ ...line })),
      diningOption: input.diningOption,
      serviceEnabled: input.serviceEnabled,
      customerId: input.customerId,
      customerName: input.customerName,
      tableId: input.tableId,
      tableLabel: input.tableLabel,
      status: "open",
      kitchenStatus: null,
      kitchenStartedAt: null,
      kitchenElapsedMinutes: 0,
      server,
      placedAt: nowIso(),
      total: totals.total,
      source: "till",
      branchId: location.branchId,
      branchName: location.branchName,
      tillId: location.tillId,
      tillName: location.tillName,
      inventoryDeducted: false,
      held: true,
    };

    const orders = [order, ...state.orders];
    const tables = syncTablesFromOrders(state.tables, orders);

    set({
      orders,
      tables,
      nextOrderNumber: state.nextOrderNumber + 1,
    });
    get().persist();
    return { ok: true, order };
  },

  voidDraftTicket: (input) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "void_order");
    if (!denied.ok) return denied;

    if (input.lines.length === 0) {
      return { ok: false, error: "Add items before voiding." };
    }

    const totals = computeTotals(input.lines, input.serviceEnabled);
    const state = get();
    const number = `#${state.nextOrderNumber}`;
    const server = useAuthStore.getState().user?.name ?? "Staff";
    const location = activeLocationStamp();

    const order: OpsOrder = {
      id: `void-${Date.now().toString(36)}`,
      number,
      lines: input.lines.map((line) => ({ ...line })),
      diningOption: input.diningOption,
      serviceEnabled: input.serviceEnabled,
      customerId: input.customerId,
      customerName: input.customerName,
      tableId: input.tableId,
      tableLabel: input.tableLabel,
      status: "void",
      kitchenStatus: null,
      kitchenStartedAt: null,
      kitchenElapsedMinutes: 0,
      server,
      placedAt: nowIso(),
      total: totals.total,
      source: "till",
      branchId: location.branchId,
      branchName: location.branchName,
      tillId: location.tillId,
      tillName: location.tillName,
      inventoryDeducted: false,
      held: false,
    };

    const orders = [order, ...state.orders];
    const tables = syncTablesFromOrders(state.tables, orders);

    set({
      orders,
      tables,
      nextOrderNumber: state.nextOrderNumber + 1,
    });
    get().persist();
    return { ok: true, order };
  },

  fireOrder: (input) => {
    if (input.lines.length === 0) {
      return { ok: false, error: "Add items before sending to kitchen." };
    }

    const totals = computeTotals(input.lines, input.serviceEnabled);
    const state = get();
    const number = `#${state.nextOrderNumber}`;
    const server = useAuthStore.getState().user?.name ?? "Staff";
    const notes = resolveKitchenNotes(input.customerId, input.lines);
    const location = activeLocationStamp();

    const order: OpsOrder = {
      id: `fire-${Date.now().toString(36)}`,
      number,
      lines: input.lines.map((line) => ({ ...line })),
      diningOption: input.diningOption,
      serviceEnabled: input.serviceEnabled,
      customerId: input.customerId,
      customerName: input.customerName,
      tableId: input.tableId,
      tableLabel: input.tableLabel,
      status: "open",
      kitchenStatus: "queued",
      kitchenNotes: notes,
      kitchenStartedAt: nowIso(),
      kitchenElapsedMinutes: 0,
      server,
      placedAt: nowIso(),
      total: totals.total,
      source: "till",
      branchId: location.branchId,
      branchName: location.branchName,
      tillId: location.tillId,
      tillName: location.tillName,
      inventoryDeducted: true,
      held: false,
    };

    const inventory = commitInventoryForLines(
      state.inventory,
      location.branchId,
      order.lines,
      undefined,
      catalogProductsForStock(),
    );
    const orders = [order, ...state.orders];
    const tables = syncTablesFromOrders(state.tables, orders);

    set({
      orders,
      tables,
      inventory,
      nextOrderNumber: state.nextOrderNumber + 1,
    });
    get().persist();
    playKitchenSound();
    return { ok: true, order };
  },

  completePayment: (input) => {
    if (input.lines.length === 0) {
      return { ok: false, error: "Nothing to pay." };
    }

    const totals = computeTotals(input.lines, input.serviceEnabled);
    if (input.payment.amountPaid + 0.001 < totals.due) {
      return { ok: false, error: "Amount paid is less than due." };
    }

    const change =
      input.payment.method === "cash"
        ? Math.round((input.payment.amountPaid - totals.due) * 100) / 100
        : 0;

    const state = get();
    const server = useAuthStore.getState().user?.name ?? "Staff";
    const existing = input.existingOrderId
      ? state.orders.find((order) => order.id === input.existingOrderId)
      : undefined;
    const kitchen = resolveKitchenOnPayment(existing);
    const notes = resolveKitchenNotes(input.customerId, input.lines);
    const location = activeLocationStamp();

    const stockBranchId = existing?.branchId ?? location.branchId;
    const order: OpsOrder = {
      id: existing?.id ?? `paid-${Date.now().toString(36)}`,
      number: existing?.number ?? `#${state.nextOrderNumber}`,
      lines: input.lines.map((line) => ({ ...line })),
      diningOption: input.diningOption,
      serviceEnabled: input.serviceEnabled,
      customerId: input.customerId,
      customerName: input.customerName,
      tableId: input.tableId,
      tableLabel: input.tableLabel,
      status: "paid",
      kitchenStatus: kitchen.kitchenStatus,
      kitchenStartedAt: kitchen.kitchenStartedAt,
      kitchenElapsedMinutes: kitchen.kitchenElapsedMinutes,
      kitchenNotes: notes || existing?.kitchenNotes,
      server: existing?.server ?? server,
      placedAt: existing?.placedAt ?? nowIso(),
      paidAt: nowIso(),
      method: input.payment.method,
      total: totals.total,
      source: "till",
      branchId: stockBranchId,
      branchName: existing?.branchName ?? location.branchName,
      tillId: existing?.tillId ?? location.tillId,
      tillName: existing?.tillName ?? location.tillName,
      inventoryDeducted: true,
      held: false,
    };

    order.receipt = buildReceipt(order, { ...input.payment, change });

    // Deduct on pay only if not already committed at Send Kitchen; reconcile
    // when lines changed between fire and pay.
    const inventory = commitInventoryForLines(
      state.inventory,
      stockBranchId,
      order.lines,
      existing
        ? { lines: existing.lines, deducted: existing.inventoryDeducted }
        : undefined,
      catalogProductsForStock(),
    );
    const orders = existing
      ? state.orders.map((item) => (item.id === existing.id ? order : item))
      : [order, ...state.orders];
    const tables = syncTablesFromOrders(
      state.tables.map((table) =>
        table.id === order.tableId
          ? {
            ...table,
            status: "free" as const,
            openTotal: undefined,
            activeOrderId: null,
            guestCount: undefined,
            server: undefined,
          }
          : table,
      ),
      orders,
    );

    const nextFloat =
      input.payment.method === "cash"
        ? Math.round((state.floatAmount + totals.due) * 100) / 100
        : state.floatAmount;

    const cashEvents =
      input.payment.method === "cash"
        ? appendCashEvent(
            state.cashEvents,
            createCashEvent({
              type: "cash_sale",
              amount: totals.due,
              reason: `Sale ${order.number}${change > 0 ? ` · change ${formatMoney(change)}` : ""}`,
              floatAfter: nextFloat,
              orderNumber: order.number,
            }),
          )
        : state.cashEvents;

    set({
      orders,
      tables,
      inventory,
      nextOrderNumber: existing
        ? state.nextOrderNumber
        : state.nextOrderNumber + 1,
      floatAmount: nextFloat,
      cashEvents,
    });
    get().persist();
    recordLoyalty(order.customerId, order.total);
    if (kitchen.newlyFired) playKitchenSound();

    return {
      ok: true,
      order,
      receipt: order.receipt!,
      change,
      firedToKitchen: kitchen.newlyFired,
    };
  },

  replaceOpenOrder: (orderId, input) => {
    if (input.lines.length === 0) {
      return { ok: false, error: "Add items before updating the order." };
    }

    const state = get();
    const existing = state.orders.find((order) => order.id === orderId);
    if (!existing || existing.status === "paid" || existing.status === "void") {
      return { ok: false, error: "Open order not found." };
    }

    const totals = computeTotals(input.lines, input.serviceEnabled);
    const notes = resolveKitchenNotes(input.customerId, input.lines);
    const stockBranchId =
      existing.branchId ?? useSettingsStore.getState().activeBranchId;
    const lines = input.lines.map((line) => ({ ...line }));

    let inventory = state.inventory;
    let inventoryDeducted = existing.inventoryDeducted;
    if (input.fireToKitchen) {
      inventory = commitInventoryForLines(
        inventory,
        stockBranchId,
        lines,
        { lines: existing.lines, deducted: existing.inventoryDeducted },
        catalogProductsForStock(),
      );
      inventoryDeducted = true;
    }

    const order: OpsOrder = {
      ...existing,
      lines,
      diningOption: input.diningOption,
      serviceEnabled: input.serviceEnabled,
      customerId: input.customerId,
      customerName: input.customerName,
      tableId: input.tableId,
      tableLabel: input.tableLabel,
      total: totals.total,
      held: input.fireToKitchen ? false : existing.held,
      kitchenStatus: input.fireToKitchen
        ? existing.kitchenStatus ?? "queued"
        : existing.kitchenStatus,
      kitchenStartedAt: input.fireToKitchen
        ? existing.kitchenStartedAt ?? nowIso()
        : existing.kitchenStartedAt,
      kitchenNotes: notes || existing.kitchenNotes,
      inventoryDeducted,
      status:
        input.fireToKitchen && existing.status === "open"
          ? kitchenStatusToTicket(existing.kitchenStatus ?? "queued")
          : existing.status,
    };

    const orders = state.orders.map((item) =>
      item.id === orderId ? order : item,
    );
    const tables = syncTablesFromOrders(state.tables, orders);
    set({ orders, tables, inventory });
    get().persist();
    if (input.fireToKitchen) playKitchenSound();
    return { ok: true, order };
  },

  recallHeldOrder: (orderId) => {
    const state = get();
    const order = state.orders.find(
      (item) => item.id === orderId && item.held && item.status === "open",
    );
    if (!order) return { ok: false, error: "Held order not found." };

    // Keep the order row — mark un-held so pay/void update the same ticket.
    const orders = state.orders.map((item) =>
      item.id === orderId ? { ...item, held: false } : item,
    );
    const tables = syncTablesFromOrders(state.tables, orders);
    set({ orders, tables });
    get().persist();
    return { ok: true, order: { ...order, held: false } };
  },

  openTableTab: (tableId) => {
    const state = get();
    const table = state.tables.find((item) => item.id === tableId);
    if (!table) return { ok: false, error: "Table not found." };

    const existing = state.orders.find(
      (order) =>
        order.tableId === tableId &&
        order.status !== "paid" &&
        order.status !== "void",
    );
    if (existing) {
      if (existing.held) {
        return get().recallHeldOrder(existing.id);
      }
      return {
        ok: false,
        error: `Table ${table.label} already has open order ${existing.number}.`,
      };
    }

    return {
      ok: false,
      error: "No open tab — assign this table on the till and send or hold.",
    };
  },

  updateOrderStatus: (orderId, status) => {
    if (status === "void") {
      const denied = assertCan(
        useAuthStore.getState().user?.role,
        "void_order",
      );
      if (!denied.ok) return denied;
    }

    const state = get();
    const current = state.orders.find((order) => order.id === orderId);
    if (!current) return { ok: false, error: "Order not found." };
    if (current.status === "paid") {
      return {
        ok: false,
        error:
          status === "void"
            ? "Paid orders cannot be voided on the till."
            : "Paid orders cannot change status.",
      };
    }
    if (current.status === "void") {
      return { ok: false, error: "Order is already voided." };
    }

    let inventory = state.inventory;
    let newlyFiredToKitchen = false;
    const orders = state.orders.map((order) => {
      if (order.id !== orderId) return order;

      const stockBranchId =
        order.branchId ?? useSettingsStore.getState().activeBranchId;

      if (status === "void" && order.inventoryDeducted) {
        inventory = restoreInventory(
          inventory,
          order.lines,
          stockBranchId,
          catalogProductsForStock(),
        );
      }

      if (status === "paid") {
        if (!order.inventoryDeducted) {
          inventory = commitInventoryForLines(
            inventory,
            stockBranchId,
            order.lines,
            undefined,
            catalogProductsForStock(),
          );
        }
        recordLoyalty(order.customerId, order.total);
      }

      let kitchenStatus: KitchenStatus | null;
      let kitchenStartedAt: string | null;

      if (status === "void") {
        kitchenStatus = null;
        kitchenStartedAt = null;
      } else if (status === "paid") {
        const kitchen = resolveKitchenOnPayment(order);
        kitchenStatus = kitchen.kitchenStatus;
        kitchenStartedAt = kitchen.kitchenStartedAt;
        newlyFiredToKitchen = kitchen.newlyFired;
      } else if (status === "open") {
        // Held / open with no kitchen ticket stays off the KDS.
        kitchenStatus = order.kitchenStatus != null ? "queued" : null;
        kitchenStartedAt = kitchenStatus
          ? order.kitchenStartedAt ?? nowIso()
          : null;
      } else {
        // Preparing / ready = same progress on board and KDS.
        kitchenStatus = ticketStatusToKitchen(status);
        kitchenStartedAt = kitchenStatus
          ? order.kitchenStartedAt ?? nowIso()
          : null;
      }

      return {
        ...order,
        status,
        kitchenStatus,
        kitchenStartedAt,
        kitchenElapsedMinutes:
          status === "paid"
            ? kitchenStatus
              ? order.kitchenElapsedMinutes ?? 0
              : 0
            : order.kitchenElapsedMinutes,
        held: status === "open" ? order.held : false,
        paidAt: status === "paid" ? order.paidAt ?? nowIso() : order.paidAt,
        inventoryDeducted:
          status === "paid"
            ? true
            : status === "void"
              ? false
              : order.inventoryDeducted,
        receipt:
          status === "paid" && !order.receipt
            ? buildReceipt({ ...order, status: "paid" })
            : order.receipt,
        method: status === "paid" ? order.method ?? "card" : order.method,
      };
    });

    const tables = syncTablesFromOrders(state.tables, orders);
    set({ orders, tables, inventory });
    get().persist();
    if (newlyFiredToKitchen) playKitchenSound();
    return { ok: true };
  },

  advanceKitchen: (orderId) => {
    const state = get();
    const current = state.orders.find((order) => order.id === orderId);
    if (!current || !current.kitchenStatus) {
      return { ok: false, error: "Kitchen ticket not found." };
    }

    const next: Record<Exclude<KitchenStatus, "served">, KitchenStatus> = {
      queued: "preparing",
      preparing: "ready",
      ready: "served",
    };
    if (current.kitchenStatus === "served") {
      return { ok: false, error: "Order already served." };
    }
    const nextKitchen = next[current.kitchenStatus];
    const keepPaymentStatus =
      current.status === "paid" || current.status === "void";

    if (nextKitchen === "served") {
      // Bump / served — leave KDS. Paid stays paid; unpaid board status stays ready.
      const orders = state.orders.map((order) =>
        order.id === orderId
          ? {
            ...order,
            kitchenStatus: "served" as const,
            kitchenStartedAt: null,
            status: keepPaymentStatus ? order.status : ("ready" as const),
            held: false,
          }
          : order,
      );
      const tables = syncTablesFromOrders(state.tables, orders);
      set({ orders, tables });
      get().persist();
      return { ok: true };
    }

    const orders = state.orders.map((order) =>
      order.id === orderId
        ? syncFoodStatus({
          ...order,
          kitchenStatus: nextKitchen,
          status: keepPaymentStatus
            ? order.status
            : kitchenStatusToTicket(nextKitchen),
          held: false,
        })
        : order,
    );
    const tables = syncTablesFromOrders(state.tables, orders);
    set({ orders, tables });
    get().persist();
    if (nextKitchen === "ready") playKitchenSound();
    return { ok: true };
  },

  setKitchenStatus: (orderId, status) => {
    const state = get();
    const current = state.orders.find((order) => order.id === orderId);
    if (!current || !current.kitchenStatus) {
      return { ok: false, error: "Kitchen ticket not found." };
    }
    if (current.kitchenStatus === status) {
      return { ok: true };
    }

    const keepPaymentStatus =
      current.status === "paid" || current.status === "void";

    const orders = state.orders.map((order) =>
      order.id === orderId
        ? syncFoodStatus({
            ...order,
            kitchenStatus: status,
            status: keepPaymentStatus
              ? order.status
              : kitchenStatusToTicket(status),
            held: false,
          })
        : order,
    );
    const tables = syncTablesFromOrders(state.tables, orders);
    set({ orders, tables });
    get().persist();
    if (status === "ready") playKitchenSound();
    return { ok: true };
  },

  seatTable: (tableId) => {
    const server = useAuthStore.getState().user?.name ?? "Staff";
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === tableId
          ? {
            ...table,
            status: "seated",
            guestCount: table.guestCount ?? Math.min(2, table.seats),
            server: table.server ?? server,
            openTotal: table.openTotal,
          }
          : table,
      ),
    }));
    get().persist();
  },

  setTableBill: (tableId) => {
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === tableId ? { ...table, status: "bill" } : table,
      ),
    }));
    get().persist();
  },

  freeTable: (tableId) => {
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === tableId
          ? {
            ...table,
            status: "free",
            guestCount: undefined,
            openTotal: undefined,
            server: undefined,
            activeOrderId: null,
          }
          : table,
      ),
    }));
    get().persist();
  },

  attachTableToActive: () => {
    // Table attachment is handled when hold/fire/pay runs via syncTablesFromOrders.
  },

  adjustInventory: (itemId, delta) => {
    const denied = assertCan(
      useAuthStore.getState().user?.role,
      "adjust_inventory",
    );
    if (!denied.ok) return;

    set((state) => ({
      inventory: state.inventory.map((item) =>
        item.id === itemId
          ? {
            ...item,
            onHand: Math.max(
              0,
              Math.round((item.onHand + delta) * 10) / 10,
            ),
          }
          : item,
      ),
    }));
    get().persist();
  },

  recordNoSale: (reason) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "open_drawer");
    if (!denied.ok) return denied;

    const state = get();
    const event = createCashEvent({
      type: "no_sale",
      amount: 0,
      reason: reason?.trim() || "Drawer opened — no sale",
      floatAfter: state.floatAmount,
    });
    set({ cashEvents: appendCashEvent(state.cashEvents, event) });
    get().persist();
    return { ok: true, event };
  },

  recordPettyCash: (amount, reason) => {
    const denied = assertCan(
      useAuthStore.getState().user?.role,
      "adjust_float",
    );
    if (!denied.ok) return denied;

    if (!(amount > 0)) return { ok: false, error: "Enter a valid amount." };
    if (!reason.trim()) return { ok: false, error: "Enter a reason." };

    const state = get();
    if (amount > state.floatAmount) {
      return { ok: false, error: "Not enough float in the drawer." };
    }

    const nextFloat = Math.round((state.floatAmount - amount) * 100) / 100;
    const event = createCashEvent({
      type: "petty_cash",
      amount,
      reason,
      floatAfter: nextFloat,
    });

    set({
      floatAmount: nextFloat,
      cashEvents: appendCashEvent(state.cashEvents, event),
    });
    get().persist();
    return { ok: true, event };
  },

  adjustFloat: (amount) => {
    const denied = assertCan(
      useAuthStore.getState().user?.role,
      "adjust_float",
    );
    if (!denied.ok) return denied;

    if (!(amount >= 0)) return { ok: false, error: "Enter a valid float." };

    const state = get();
    const nextFloat = Math.round(amount * 100) / 100;
    const previous = state.floatAmount;
    const event = createCashEvent({
      type: "float_adjust",
      amount: nextFloat,
      reason: `Float set from ${formatMoney(previous)} to ${formatMoney(nextFloat)}`,
      floatAfter: nextFloat,
    });

    set({
      floatAmount: nextFloat,
      cashEvents: appendCashEvent(state.cashEvents, event),
    });
    get().persist();
    return { ok: true, event };
  },

  getTicketOrders: () => {
    const showDemo = useSettingsStore.getState().showDemoSeed;
    const state = get();
    return state.orders
      .filter((order) => showDemo || order.source === "till")
      .map((order) => ({
        id: order.id,
        number: order.number,
        table: order.tableLabel ?? undefined,
        channel: order.diningOption,
        status: order.status,
        kitchenStatus: order.kitchenStatus,
        guestName: order.customerName ?? undefined,
        items: order.lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          note: line.note,
          promotionLabel: line.promotionLabel,
        })),
        total: order.total,
        placedAt: order.placedAt,
        server: order.server,
        receipt: displayReceiptFor(order),
        method: order.method,
        held: order.held,
        source: order.source,
        branchId: order.branchId,
        branchName: order.branchName,
      }));
  },

  getKitchenTickets: () => {
    const showDemo = useSettingsStore.getState().showDemoSeed;
    return get()
      .orders.filter(
        (order) =>
          order.kitchenStatus != null &&
          ACTIVE_KITCHEN.includes(order.kitchenStatus) &&
          (showDemo || order.source === "till"),
      )
      .map((order) => {
        const startedAt =
          resolveKitchenStartedAt(order) ?? nowIso();
        const elapsedMinutes = Math.floor(
          Math.max(0, Date.now() - Date.parse(startedAt)) / 60_000,
        );
        return {
          id: order.id,
          orderId: order.id,
          orderNumber: order.number,
          table: order.tableLabel ?? undefined,
          channel: order.diningOption,
          status: order.kitchenStatus as Exclude<KitchenStatus, "served">,
          items: order.lines.map((line) => ({
            name: line.name,
            quantity: line.quantity,
          })),
          notes: order.kitchenNotes,
          startedAt,
          elapsedMinutes,
          branchId: order.branchId,
        };
      });
  },

  getHeldOrders: () =>
    get().orders.filter(
      (order) =>
        order.held &&
        order.status === "open" &&
        order.source === "till",
    ),

  getPaidOrders: () =>
    get().orders.filter(
      (order) => order.status === "paid" && order.source === "till",
    ),

  getCashEvents: (limit = 50) => get().cashEvents.slice(0, limit),

  loadDemoSeed: () => {
    const demo = demoOrdersToOps().map(syncFoodStatus);
    const branchIds = activeBranchIds();
    set((state) => {
      const withoutDemo = state.orders.filter(
        (order) => order.source !== "demo",
      );
      const baseTables = tablesForBranches(branchIds);
      const overlayById = new Map(
        DEMO_TABLES.map((table) => [table.id, table]),
      );
      const tables = baseTables.map(
        (table) => overlayById.get(table.id) ?? table,
      );
      const { orders } = upgradeLegacyReceipts([...withoutDemo, ...demo]);
      return {
        orders,
        tables: syncTablesFromOrders(tables, orders),
      };
    });
    get().persist();
  },

  clearDemoSeed: () => {
    const branchIds = activeBranchIds();
    set((state) => {
      const orders = state.orders.filter((order) => order.source !== "demo");
      return {
        orders,
        tables: syncTablesFromOrders(tablesForBranches(branchIds), orders),
      };
    });
    get().persist();
  },

  ensureBranchAssets: (branchIds) => {
    if (branchIds.length === 0) return;
    const state = get();
    const allIds = [
      ...new Set([
        ...activeBranchIds(),
        ...branchIds,
      ]),
    ];
    const tables = normalizeTables(state.tables, allIds);
    const inventory = normalizeInventory(state.inventory, allIds);
    if (!tables.changed && !inventory.changed) return;
    set({
      tables: syncTablesFromOrders(tables.tables, state.orders),
      inventory: inventory.inventory,
    });
    if (state.hydrated) get().persist();
  },
}));
