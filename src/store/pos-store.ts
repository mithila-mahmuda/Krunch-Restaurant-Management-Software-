"use client";

import { create } from "zustand";
import { diningOptionLabel, formatMoney } from "@/lib/format";
import {
  inventoryForTillCheck,
  stockShortfallsForLines,
  type StockShortfall,
} from "@/lib/inventory-stock";
import { promotions } from "@/lib/mock-data";
import { printReceiptText } from "@/lib/print-receipt";
import {
  buildReceiptData,
  resolveReceiptBrand,
  serializeReceipt,
} from "@/lib/receipt";
import type {
  DiningOption,
  HeldOrder,
  OrderLine,
  Product,
  SidebarTab,
  PaymentResult,
} from "@/lib/types";
import { assertCan } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth-store";
import { useCatalogStore } from "@/store/catalog-store";
import { useOpsStore } from "@/store/ops-store";
import { useSettingsStore } from "@/store/settings-store";

export type StatusTone = "info" | "warning";

interface PosState {
  activeCategoryId: string | null;
  lines: OrderLine[];
  selectedLineId: string | null;
  diningOption: DiningOption;
  serviceEnabled: boolean;
  activeTab: SidebarTab;
  navOpen: boolean;
  orderPanelOpen: boolean;
  customerId: string | null;
  customerName: string | null;
  tableId: string | null;
  tableLabel: string | null;
  /** When set, pay/fire updates this ops order instead of creating a new one. */
  editingOrderId: string | null;
  statusMessage: string | null;
  statusTone: StatusTone;
  lastReceipt: string | null;
  setActiveCategory: (categoryId: string | null) => void;
  setActiveTab: (tab: SidebarTab) => void;
  setNavOpen: (open: boolean) => void;
  setOrderPanelOpen: (open: boolean) => void;
  addProduct: (
    product: Product,
  ) => { ok: true } | { ok: false; error: string };
  addMiscProduct: (name: string, price: number) => void;
  selectLine: (lineId: string | null) => void;
  updateQuantity: (lineId: string, delta: number) => void;
  /** Soft stock check for the current ticket (does not block). */
  getStockShortfalls: () => StockShortfall[];
  removeLine: (lineId: string) => void;
  clearOrder: () => void;
  setDiningOption: (option: DiningOption) => void;
  toggleService: () => void;
  setLineNote: (lineId: string, note: string) => void;
  applyLineDiscount: (
    lineId: string,
    amount: number,
    meta?: { mode: "amount" | "percent"; percent?: number },
  ) => void;
  attachCustomer: (customer: { id: string; name: string } | null) => void;
  attachTable: (table: { id: string; label: string } | null) => void;
  holdOrder: () => { ok: true; order: HeldOrder } | { ok: false; error: string };
  fireOrder: () => { ok: true } | { ok: false; error: string };
  recallOrder: (orderId: string) => { ok: true } | { ok: false; error: string };
  loadOpenOrder: (orderId: string) => { ok: true } | { ok: false; error: string };
  loadTableTab: (tableId: string) => { ok: true } | { ok: false; error: string };
  voidOrder: () => { ok: true } | { ok: false; error: string };
  completePayment: (
    payment: PaymentResult,
  ) => { ok: true; receipt: string } | { ok: false; error: string };
  openCashDrawer: (
    reason: string,
  ) => { ok: true } | { ok: false; error: string };
  recordPettyCash: (
    amount: number,
    reason: string,
  ) => { ok: true } | { ok: false; error: string };
  adjustFloat: (
    amount: number,
  ) => { ok: true } | { ok: false; error: string };
  printReceipt: () =>
    | {
        ok: true;
        receipt: string;
        printed: boolean;
      }
    | { ok: false; error: string };
  setStatusMessage: (message: string | null, tone?: StatusTone) => void;
  applyServiceDefault: () => void;
}

function currentStockShortfalls(
  lines: OrderLine[],
  editingOrderId: string | null,
): StockShortfall[] {
  const branchId = useSettingsStore.getState().activeBranchId;
  const ops = useOpsStore.getState();
  const products = useCatalogStore.getState().products;
  const editing = editingOrderId
    ? ops.orders.find((order) => order.id === editingOrderId)
    : null;
  const inventory = inventoryForTillCheck(
    ops.inventory,
    branchId,
    editing
      ? {
          lines: editing.lines,
          inventoryDeducted: editing.inventoryDeducted,
        }
      : null,
    products,
  );
  return stockShortfallsForLines(lines, products, inventory, branchId);
}

function createLineId(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Keep same-product variants (notes / discounts) adjacent on the ticket. */
function groupLinesByProduct(lines: OrderLine[]): OrderLine[] {
  const groups = new Map<string, OrderLine[]>();
  const productOrder: string[] = [];

  for (const line of lines) {
    const group = groups.get(line.productId);
    if (!group) {
      groups.set(line.productId, [line]);
      productOrder.push(line.productId);
    } else {
      group.push(line);
    }
  }

  return productOrder.flatMap((productId) => groups.get(productId) ?? []);
}

function applyPromotions(lines: OrderLine[]): OrderLine[] {
  const next = lines.map((line) => ({
    ...line,
    discountAmount: line.manualDiscountAmount,
    promotionLabel: undefined as string | undefined,
  }));

  for (const promo of promotions) {
    const eligible = next.filter((line) =>
      promo.productIds.includes(line.productId),
    );
    const eligibleQty = eligible.reduce((sum, line) => sum + line.quantity, 0);

    if (eligibleQty < promo.requiredQuantity) continue;

    let unitsToDiscount =
      Math.floor(eligibleQty / promo.requiredQuantity) * promo.requiredQuantity;

    for (const line of eligible) {
      if (unitsToDiscount <= 0) break;

      const discountableUnits = Math.min(line.quantity, unitsToDiscount);
      const fullPrice = line.unitPrice * discountableUnits;
      const promoPrice = promo.discountedUnitPrice * discountableUnits;
      const discount = Math.max(0, fullPrice - promoPrice);

      line.discountAmount = line.manualDiscountAmount + discount;
      line.promotionLabel = promo.label;
      unitsToDiscount -= discountableUnits;
    }
  }

  return groupLinesByProduct(next);
}

function emptyTicket() {
  return {
    lines: [] as OrderLine[],
    selectedLineId: null as string | null,
    customerId: null as string | null,
    customerName: null as string | null,
    tableId: null as string | null,
    tableLabel: null as string | null,
    editingOrderId: null as string | null,
    serviceEnabled: useSettingsStore.getState().serviceDefault,
    diningOption: "eat_in" as DiningOption,
  };
}

function ticketSnapshot(state: PosState) {
  return {
    lines: state.lines,
    diningOption: state.diningOption,
    serviceEnabled: state.serviceEnabled,
    customerId: state.customerId,
    customerName: state.customerName,
    tableId: state.tableId,
    tableLabel: state.tableLabel,
  };
}

function buildLocalReceipt(state: {
  lines: OrderLine[];
  serviceEnabled: boolean;
  diningOption: DiningOption;
  customerName: string | null;
  tableId: string | null;
  tableLabel: string | null;
  editingOrderId?: string | null;
  payment?: PaymentResult;
}): string {
  const auth = useAuthStore.getState().user;
  const brand = resolveReceiptBrand();
  const ops = useOpsStore.getState();
  const existing = state.editingOrderId
    ? ops.orders.find((order) => order.id === state.editingOrderId)
    : undefined;

  return serializeReceipt(
    buildReceiptData({
      lines: state.lines,
      diningOption: state.diningOption,
      serviceEnabled: state.serviceEnabled,
      orderNumber: existing?.number ?? "PREVIEW",
      tableLabel: state.tableLabel,
      customerName: state.customerName,
      server: existing?.server ?? auth?.name ?? "Staff",
      orderedAt: existing?.placedAt ?? new Date(),
      payment: state.payment
        ? { ...state.payment, change: state.payment.change }
        : undefined,
      restaurantName: brand.restaurantName,
      phone: brand.phone,
      addressLines: brand.addressLines,
      logoDataUrl: brand.logoDataUrl,
    }),
  );
}

function toHeldOrder(order: {
  id: string;
  number: string;
  lines: OrderLine[];
  diningOption: DiningOption;
  serviceEnabled: boolean;
  customerId: string | null;
  customerName: string | null;
  tableId: string | null;
  tableLabel: string | null;
  placedAt: string;
  total: number;
}): HeldOrder {
  return {
    id: order.id,
    number: order.number,
    lines: order.lines,
    diningOption: order.diningOption,
    serviceEnabled: order.serviceEnabled,
    customerId: order.customerId,
    customerName: order.customerName,
    tableId: order.tableId,
    tableLabel: order.tableLabel,
    heldAt: order.placedAt,
    total: order.total,
  };
}

export const usePosStore = create<PosState>((set, get) => ({
  activeCategoryId: null,
  lines: [],
  selectedLineId: null,
  diningOption: "eat_in",
  serviceEnabled: false,
  activeTab: "menu",
  navOpen: false,
  orderPanelOpen: false,
  customerId: null,
  customerName: null,
  tableId: null,
  tableLabel: null,
  editingOrderId: null,
  statusMessage: null,
  statusTone: "info",
  lastReceipt: null,

  setActiveCategory: (categoryId) => set({ activeCategoryId: categoryId }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setNavOpen: (open) => set({ navOpen: open }),
  setOrderPanelOpen: (open) => set({ orderPanelOpen: open }),
  setStatusMessage: (message, tone = "info") =>
    set({ statusMessage: message, statusTone: tone }),

  applyServiceDefault: () => {
    set({ serviceEnabled: useSettingsStore.getState().serviceDefault });
  },

  getStockShortfalls: () => {
    const state = get();
    return currentStockShortfalls(state.lines, state.editingOrderId);
  },

  addProduct: (product) => {
    const catalogProduct =
      useCatalogStore.getState().getProduct(product.id) ?? product;
    if (catalogProduct.available === false) {
      set({
        statusMessage: `${catalogProduct.name} is unavailable`,
        statusTone: "warning",
      });
      return { ok: false, error: `${catalogProduct.name} is unavailable` };
    }

    const state = get();
    const existing = state.lines.find(
      (line) =>
        line.productId === catalogProduct.id &&
        !line.note &&
        line.manualDiscountAmount === 0,
    );

    let lines: OrderLine[];
    let selectedLineId: string;

    if (existing) {
      lines = state.lines.map((line) =>
        line.id === existing.id
          ? { ...line, quantity: line.quantity + 1 }
          : line,
      );
      selectedLineId = existing.id;
    } else {
      const newLine: OrderLine = {
        id: createLineId(),
        productId: catalogProduct.id,
        name: catalogProduct.name,
        unitPrice: catalogProduct.price,
        quantity: 1,
        manualDiscountAmount: 0,
        discountAmount: 0,
      };
      lines = [...state.lines, newLine];
      selectedLineId = newLine.id;
    }

    set({
      lines: applyPromotions(lines),
      selectedLineId,
      activeCategoryId: state.activeCategoryId ?? catalogProduct.categoryId,
      orderPanelOpen: state.orderPanelOpen,
    });

    return { ok: true };
  },

  addMiscProduct: (name, price) => {
    const trimmed = name.trim();
    if (!trimmed || !(price > 0)) return;

    set((state) => {
      const newLine: OrderLine = {
        id: createLineId(),
        productId: `misc-${Date.now().toString(36)}`,
        name: trimmed,
        unitPrice: Math.round(price * 100) / 100,
        quantity: 1,
        manualDiscountAmount: 0,
        discountAmount: 0,
      };
      const lines = applyPromotions([...state.lines, newLine]);
      return {
        lines,
        selectedLineId: newLine.id,
        activeTab: "menu",
        statusMessage: `Added ${trimmed}`,
      };
    });
  },

  selectLine: (lineId) => set({ selectedLineId: lineId }),

  updateQuantity: (lineId, delta) => {
    set((state) => {
      const lines = state.lines
        .map((line) =>
          line.id === lineId
            ? { ...line, quantity: line.quantity + delta }
            : line,
        )
        .filter((line) => line.quantity > 0)
        .map((line) => ({
          ...line,
          manualDiscountAmount: Math.min(
            line.manualDiscountAmount,
            line.unitPrice * line.quantity,
          ),
        }));

      return {
        lines: applyPromotions(lines),
        selectedLineId: lines.some((line) => line.id === lineId)
          ? lineId
          : lines.at(-1)?.id ?? null,
      };
    });
  },

  removeLine: (lineId) => {
    set((state) => {
      const lines = applyPromotions(
        state.lines.filter((line) => line.id !== lineId),
      );
      return {
        lines,
        selectedLineId:
          state.selectedLineId === lineId
            ? lines.at(-1)?.id ?? null
            : state.selectedLineId,
      };
    });
  },

  clearOrder: () => set({ ...emptyTicket(), statusMessage: "Order cleared" }),

  setDiningOption: (option) =>
    set({
      diningOption: option,
      statusMessage: `Dining set to ${diningOptionLabel(option)}`,
    }),

  toggleService: () =>
    set((state) => ({ serviceEnabled: !state.serviceEnabled })),

  setLineNote: (lineId, note) => {
    set((state) => ({
      lines: state.lines.map((line) =>
        line.id === lineId ? { ...line, note: note.trim() || undefined } : line,
      ),
      statusMessage: note.trim() ? "Note saved" : "Note cleared",
    }));
  },

  applyLineDiscount: (lineId, amount, meta) => {
    if (amount > 0) {
      const denied = assertCan(
        useAuthStore.getState().user?.role,
        "apply_discount",
      );
      if (!denied.ok) {
        set({ statusMessage: denied.error });
        return;
      }
    }

    set((state) => {
      const lines = state.lines.map((line) => {
        if (line.id !== lineId) return line;
        const capped = Math.min(
          Math.max(0, amount),
          line.unitPrice * line.quantity,
        );
        return {
          ...line,
          manualDiscountAmount: Math.round(capped * 100) / 100,
        };
      });

      let statusMessage = "Discount cleared";
      if (amount > 0) {
        statusMessage =
          meta?.mode === "percent" && meta.percent != null
            ? `Discount ${meta.percent}% (${formatMoney(amount)}) applied`
            : `Discount ${formatMoney(amount)} applied`;
      }

      return {
        lines: applyPromotions(lines),
        statusMessage,
      };
    });
  },

  attachCustomer: (customer) =>
    set({
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      statusMessage: customer
        ? `${customer.name} attached`
        : "Customer removed",
    }),

  attachTable: (table) => {
    if (table) {
      const floor = useOpsStore
        .getState()
        .tables.find((item) => item.id === table.id);
      if (floor?.status === "free") {
        useOpsStore.getState().seatTable(table.id);
      }
    }
    set({
      tableId: table?.id ?? null,
      tableLabel: table?.label ?? null,
      statusMessage: table ? `Table ${table.label} assigned` : "Table cleared",
    });
  },

  holdOrder: () => {
    const state = get();
    const result = useOpsStore.getState().holdOrder(ticketSnapshot(state));
    if (!result.ok) return result;

    set({
      ...emptyTicket(),
      activeTab: "orders",
      statusMessage: `Order ${result.order.number} held — recall from Orders`,
    });

    return { ok: true, order: toHeldOrder(result.order) };
  },

  fireOrder: () => {
    const state = get();
    const ops = useOpsStore.getState();
    const result = state.editingOrderId
      ? ops.replaceOpenOrder(state.editingOrderId, {
          ...ticketSnapshot(state),
          fireToKitchen: true,
        })
      : ops.fireOrder(ticketSnapshot(state));
    if (!result.ok) return result;

    set({
      ...emptyTicket(),
      activeTab: "orders",
      statusMessage: `Order ${result.order.number} sent to kitchen`,
    });

    return { ok: true };
  },

  recallOrder: (orderId) => {
    const state = get();
    if (state.lines.length > 0) {
      return {
        ok: false,
        error: "Clear or hold the current ticket before recalling.",
      };
    }

    const result = useOpsStore.getState().recallHeldOrder(orderId);
    if (!result.ok) return result;

    const order = result.order;
    const lines = groupLinesByProduct(
      order.lines.map((line) => ({ ...line })),
    );
    set({
      lines,
      selectedLineId: lines.at(-1)?.id ?? null,
      diningOption: order.diningOption,
      serviceEnabled: order.serviceEnabled,
      customerId: order.customerId,
      customerName: order.customerName,
      tableId: order.tableId,
      tableLabel: order.tableLabel,
      editingOrderId: order.id,
      activeTab: "menu",
      statusMessage: `Recalled ${order.number}`,
    });

    return { ok: true };
  },

  loadOpenOrder: (orderId) => {
    const state = get();
    if (state.lines.length > 0) {
      return {
        ok: false,
        error: "Clear or hold the current ticket before opening another order.",
      };
    }

    const order = useOpsStore.getState().orders.find(
      (item) =>
        item.id === orderId &&
        item.status !== "paid" &&
        item.status !== "void",
    );
    if (!order) {
      return { ok: false, error: "Open order not found." };
    }

    if (order.held) {
      return get().recallOrder(orderId);
    }

    const lines = groupLinesByProduct(
      order.lines.map((line) => ({ ...line })),
    );
    set({
      lines,
      selectedLineId: lines.at(-1)?.id ?? null,
      diningOption: order.diningOption,
      serviceEnabled: order.serviceEnabled,
      customerId: order.customerId,
      customerName: order.customerName,
      tableId: order.tableId,
      tableLabel: order.tableLabel,
      editingOrderId: order.id,
      activeTab: "menu",
      orderPanelOpen: false,
      statusMessage: `Loaded ${order.number} on the till`,
    });

    return { ok: true };
  },

  voidOrder: () => {
    const denied = assertCan(useAuthStore.getState().user?.role, "void_order");
    if (!denied.ok) return denied;

    const state = get();
    const ops = useOpsStore.getState();

    if (state.editingOrderId) {
      const result = ops.updateOrderStatus(state.editingOrderId, "void");
      if (!result.ok) return result;
      set({
        ...emptyTicket(),
        statusMessage: "Order voided",
      });
      return { ok: true };
    }

    // New ticket — void without hold/send first (records a voided order).
    if (state.lines.length === 0) {
      return { ok: false, error: "Nothing to void." };
    }

    const result = ops.voidDraftTicket(ticketSnapshot(state));
    if (!result.ok) return result;

    set({
      ...emptyTicket(),
      statusMessage: `Order ${result.order.number} voided`,
    });
    return { ok: true };
  },

  loadTableTab: (tableId) => {
    const state = get();
    if (state.lines.length > 0) {
      return {
        ok: false,
        error: "Clear or hold the current ticket first.",
      };
    }

    const ops = useOpsStore.getState();
    const open = ops.orders.find(
      (order) =>
        order.tableId === tableId &&
        order.status !== "paid" &&
        order.status !== "void",
    );

    if (!open) {
      const table = ops.tables.find((item) => item.id === tableId);
      if (table) {
        if (table.branchId) {
          useSettingsStore.getState().setActiveBranch(table.branchId);
        }
        set({
          tableId: table.id,
          tableLabel: table.label,
          editingOrderId: null,
          activeTab: "menu",
          statusMessage: `Table ${table.label} ready for new order`,
        });
        if (table.status === "free") ops.seatTable(table.id);
        return { ok: true };
      }
      return { ok: false, error: "Table not found." };
    }

    if (open.branchId) {
      useSettingsStore.getState().setActiveBranch(open.branchId);
    }

    if (open.held) {
      return get().recallOrder(open.id);
    }

    const lines = groupLinesByProduct(open.lines.map((line) => ({ ...line })));
    set({
      lines,
      selectedLineId: lines.at(-1)?.id ?? null,
      diningOption: open.diningOption,
      serviceEnabled: open.serviceEnabled,
      customerId: open.customerId,
      customerName: open.customerName,
      tableId: open.tableId,
      tableLabel: open.tableLabel,
      editingOrderId: open.id,
      activeTab: "menu",
      statusMessage: `Loaded ${open.number} for ${open.tableLabel}`,
    });

    return { ok: true };
  },

  completePayment: (payment) => {
    const state = get();
    const result = useOpsStore.getState().completePayment({
      ...ticketSnapshot(state),
      payment,
      existingOrderId: state.editingOrderId,
    });
    if (!result.ok) return result;

    const kitchenNote = result.firedToKitchen
      ? " · Sent to kitchen"
      : result.order.kitchenStatus
        ? ` · Kitchen: ${result.order.kitchenStatus}`
        : "";

    set({
      ...emptyTicket(),
      lastReceipt: result.receipt,
      statusMessage: `Paid ${formatMoney(result.order.total)}${
        result.change > 0 ? ` · Change ${formatMoney(result.change)}` : ""
      }${kitchenNote}`,
    });

    return { ok: true, receipt: result.receipt };
  },

  openCashDrawer: (reason) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "open_drawer");
    if (!denied.ok) return denied;

    const result = useOpsStore.getState().recordNoSale(reason);
    if (!result.ok) return result;

    set({
      statusMessage: "No sale recorded — drawer open logged",
    });
    return { ok: true };
  },

  recordPettyCash: (amount, reason) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "adjust_float");
    if (!denied.ok) return denied;

    const result = useOpsStore.getState().recordPettyCash(amount, reason);
    if (!result.ok) return result;

    set({
      statusMessage: `Petty cash ${formatMoney(amount)} recorded`,
    });
    return { ok: true };
  },

  adjustFloat: (amount) => {
    const result = useOpsStore.getState().adjustFloat(amount);
    if (!result.ok) return result;

    set({
      statusMessage: `Float set to ${formatMoney(amount)}`,
    });
    return { ok: true };
  },

  printReceipt: () => {
    const state = get();
    if (state.lines.length === 0 && !state.lastReceipt) {
      return { ok: false, error: "No receipt to print." };
    }

    const receipt =
      state.lines.length > 0
        ? buildLocalReceipt(state)
        : (state.lastReceipt as string);

    const printed = printReceiptText(receipt);

    set({
      lastReceipt: receipt,
      statusMessage: printed
        ? "Receipt sent to printer"
        : "Receipt ready — allow pop-ups to print, or use Print again",
    });
    return { ok: true, receipt, printed };
  },
}));

/** Selectors that read live ops data (for components still expecting POS lists). */
export function selectHeldOrders() {
  return useOpsStore.getState().getHeldOrders().map(toHeldOrder);
}

export function selectFloatAmount() {
  return useOpsStore.getState().floatAmount;
}
