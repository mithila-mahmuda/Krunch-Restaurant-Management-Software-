"use client";

import { create } from "zustand";
import {
  loadPurchases,
  loadSuppliers,
  savePurchases,
  saveSuppliers,
} from "@/lib/db/repos";
import { queueDbWrite } from "@/lib/db/write";
import {
  INITIAL_SUPPLIERS,
  type PurchaseAttachment,
  type PurchaseEntry,
  type PurchaseLine,
  type Supplier,
} from "@/lib/purchases";
import { assertCan } from "@/lib/permissions";
import { DEMO_RESTAURANT_ID, tenantEntityId } from "@/lib/tenant";
import { useAuthStore } from "@/store/auth-store";
import { useOpsStore } from "@/store/ops-store";

function nextSupplierCode(): string {
  return `v-${Date.now()}`;
}

function seedSuppliers(restaurantId: string): Supplier[] {
  return INITIAL_SUPPLIERS.map((supplier) => ({
    ...supplier,
    id: tenantEntityId(restaurantId, supplier.id),
    restaurantId,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeStoredSupplier(row: Supplier): Supplier {
  return {
    ...row,
    code: row.code?.trim() || nextSupplierCode(),
    contactPerson: row.contactPerson?.trim() || undefined,
    phone: row.phone?.trim() || undefined,
    email: row.email?.trim() || undefined,
    address: row.address?.trim() || undefined,
    notes: row.notes?.trim() || undefined,
  };
}

export type SupplierWriteInput = {
  name: string;
  code?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type SupplierWriteResult =
  | { ok: true; supplier: Supplier }
  | { ok: false; error: string };

export type PurchaseLineInput = {
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  inventoryItemId?: string;
};

export type PurchaseWriteInput = {
  supplierId?: string;
  supplierName: string;
  branchId: string;
  lines: PurchaseLineInput[];
  paid?: number;
  note?: string;
  attachments?: PurchaseAttachment[];
};

export type PurchaseWriteResult =
  | { ok: true; purchase: PurchaseEntry; supplier: Supplier }
  | { ok: false; error: string };

interface PurchaseState {
  restaurantId: string | null;
  suppliers: Supplier[];
  purchases: PurchaseEntry[];
  hydrated: boolean;
  hydrateForRestaurant: (restaurantId: string) => Promise<void>;
  hydrate: () => Promise<void>;
  persist: () => void;
  addSupplier: (input: SupplierWriteInput) => SupplierWriteResult;
  updateSupplier: (
    id: string,
    input: SupplierWriteInput,
  ) => SupplierWriteResult;
  recordPurchase: (input: PurchaseWriteInput) => PurchaseWriteResult;
  /** Apply a payment to a supplier's outstanding purchase dues. */
  paySupplier: (
    supplierId: string,
    amount: number,
  ) => { ok: true; applied: number } | { ok: false; error: string };
}

function nowIso(): string {
  return new Date().toISOString();
}

function newLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeSupplier(input: SupplierWriteInput) {
  const email = (input.email ?? "").trim().toLowerCase();
  return {
    name: input.name.trim(),
    code: (input.code ?? "").trim(),
    contactPerson: (input.contactPerson ?? "").trim() || undefined,
    phone: (input.phone ?? "").trim() || undefined,
    email: email || undefined,
    address: (input.address ?? "").trim() || undefined,
    notes: (input.notes ?? "").trim() || undefined,
  };
}

function validateSupplier(
  suppliers: Supplier[],
  input: ReturnType<typeof normalizeSupplier>,
  excludeId?: string,
): string | null {
  if (input.name.length < 2) return "Enter a supplier name.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return "Enter a valid email address.";
  }
  const duplicate = suppliers.find(
    (supplier) =>
      supplier.id !== excludeId &&
      supplier.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (duplicate) return "A supplier with that name already exists.";
  return null;
}

function lineTotal(quantity: number, rate: number): number {
  return Math.round(quantity * rate * 100) / 100;
}

export const usePurchaseStore = create<PurchaseState>((set, get) => ({
  restaurantId: null,
  suppliers: [],
  purchases: [],
  hydrated: false,

  hydrateForRestaurant: async (restaurantId) => {
    if (get().hydrated && get().restaurantId === restaurantId) return;
    const [storedSuppliers, purchases] = await Promise.all([
      loadSuppliers(restaurantId),
      loadPurchases(restaurantId),
    ]);
    const seed = seedSuppliers(restaurantId);
    const suppliers =
      storedSuppliers.length > 0
        ? storedSuppliers.map(normalizeStoredSupplier)
        : seed;
    const needsBackfill =
      storedSuppliers.length > 0 &&
      storedSuppliers.some((row) => !row.code?.trim());
    set({
      restaurantId,
      suppliers,
      purchases,
      hydrated: true,
    });
    if ((storedSuppliers.length === 0 && seed.length > 0) || needsBackfill) {
      get().persist();
    }
  },

  hydrate: async () => {
    await get().hydrateForRestaurant(get().restaurantId ?? DEMO_RESTAURANT_ID);
  },

  persist: () => {
    if (!get().hydrated) return;
    const restaurantId = get().restaurantId;
    if (!restaurantId) return;
    queueDbWrite(
      () =>
        Promise.all([
          saveSuppliers(restaurantId, get().suppliers),
          savePurchases(restaurantId, get().purchases),
        ]).then(() => undefined),
      "save purchases",
    );
  },

  addSupplier: (input) => {
    const denied = assertCan(
      useAuthStore.getState().user?.role,
      "access_purchases",
    );
    if (!denied.ok) return denied;

    const contact = normalizeSupplier(input);
    const error = validateSupplier(get().suppliers, contact);
    if (error) return { ok: false, error };

    const restaurantId = get().restaurantId ?? DEMO_RESTAURANT_ID;
    const supplier: Supplier = {
      id: tenantEntityId(restaurantId, newLocalId("sup")),
      restaurantId,
      code: contact.code || nextSupplierCode(),
      name: contact.name,
      contactPerson: contact.contactPerson,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
      notes: contact.notes,
      createdAt: nowIso(),
    };

    set((state) => ({
      suppliers: [supplier, ...state.suppliers].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
    get().persist();
    return { ok: true, supplier };
  },

  updateSupplier: (id, input) => {
    const denied = assertCan(
      useAuthStore.getState().user?.role,
      "access_purchases",
    );
    if (!denied.ok) return denied;

    const contact = normalizeSupplier(input);
    const error = validateSupplier(get().suppliers, contact, id);
    if (error) return { ok: false, error };

    const existing = get().suppliers.find((supplier) => supplier.id === id);
    if (!existing) return { ok: false, error: "Supplier not found." };

    const supplier: Supplier = {
      ...existing,
      code: contact.code || existing.code || nextSupplierCode(),
      name: contact.name,
      contactPerson: contact.contactPerson,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
      notes: contact.notes,
    };

    set((state) => ({
      suppliers: state.suppliers
        .map((row) => (row.id === id ? supplier : row))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    get().persist();
    return { ok: true, supplier };
  },

  recordPurchase: (input) => {
    const denied = assertCan(
      useAuthStore.getState().user?.role,
      "adjust_inventory",
    );
    if (!denied.ok) return denied;

    const supplierName = input.supplierName.trim();
    if (supplierName.length < 2) {
      return { ok: false, error: "Enter a supplier name." };
    }

    if (!input.branchId.trim()) {
      return { ok: false, error: "Choose a branch for this purchase." };
    }

    const cleanedLines = input.lines.map((line) => ({
      name: line.name.trim(),
      quantity: Number(line.quantity),
      unit: line.unit.trim(),
      rate: Number(line.rate),
      inventoryItemId: line.inventoryItemId,
    }));

    if (cleanedLines.length === 0) {
      return { ok: false, error: "Add at least one purchase item." };
    }

    for (const [index, line] of cleanedLines.entries()) {
      const label = line.name || `item ${index + 1}`;
      if (!line.name) {
        return { ok: false, error: `Enter a name for ${label}.` };
      }
      if (!(line.quantity > 0) || !Number.isFinite(line.quantity)) {
        return { ok: false, error: `Enter a valid quantity for ${label}.` };
      }
      if (!line.unit) {
        return { ok: false, error: `Choose a unit for ${label}.` };
      }
      if (!(line.rate >= 0) || !Number.isFinite(line.rate)) {
        return { ok: false, error: `Enter a valid rate for ${label}.` };
      }
    }

    let supplier =
      (input.supplierId
        ? get().suppliers.find((row) => row.id === input.supplierId)
        : undefined) ??
      get().suppliers.find(
        (row) => row.name.toLowerCase() === supplierName.toLowerCase(),
      );

    if (!supplier) {
      const created = get().addSupplier({ name: supplierName });
      if (!created.ok) return created;
      supplier = created.supplier;
    } else if (supplier.name !== supplierName) {
      const renamed = get().updateSupplier(supplier.id, {
        code: supplier.code,
        name: supplierName,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
      });
      if (!renamed.ok) return renamed;
      supplier = renamed.supplier;
    }

    const stockResult = useOpsStore.getState().receivePurchaseStock({
      branchId: input.branchId,
      lines: cleanedLines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        inventoryItemId: line.inventoryItemId,
      })),
    });
    if (!stockResult.ok) return stockResult;

    const restaurantId = get().restaurantId ?? DEMO_RESTAURANT_ID;
    const lines: PurchaseLine[] = cleanedLines.map((line, index) => {
      const matched = stockResult.lines[index];
      return {
        id: newLocalId("pline"),
        inventoryItemId: matched?.inventoryItemId,
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        rate: line.rate,
        total: lineTotal(line.quantity, line.rate),
      };
    });

    const total =
      Math.round(lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100;
    const paidRaw = Number(input.paid ?? 0);
    // Allow overpay so supplier balance can show as Advance (negative due).
    const paid =
      Number.isFinite(paidRaw) && paidRaw >= 0
        ? Math.round(paidRaw * 100) / 100
        : 0;
    const due = Math.round((total - paid) * 100) / 100;
    const note = input.note?.trim() || undefined;
    const attachments = (input.attachments ?? [])
      .map((file) => ({
        id: file.id,
        name: file.name.trim(),
        dataUrl: file.dataUrl,
      }))
      .filter((file) => file.name.length > 0);

    const purchase: PurchaseEntry = {
      id: tenantEntityId(restaurantId, newLocalId("pur")),
      restaurantId,
      branchId: input.branchId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      lines,
      total,
      paid,
      due,
      note,
      attachments: attachments.length > 0 ? attachments : undefined,
      purchasedAt: nowIso(),
      createdByName: useAuthStore.getState().user?.name,
    };

    set((state) => ({
      purchases: [purchase, ...state.purchases],
    }));
    get().persist();
    return { ok: true, purchase, supplier };
  },

  paySupplier: (supplierId, amount) => {
    const denied = assertCan(
      useAuthStore.getState().user?.role,
      "adjust_inventory",
    );
    if (!denied.ok) return denied;

    const payment = Math.round(Number(amount) * 100) / 100;
    if (!(payment > 0) || !Number.isFinite(payment)) {
      return { ok: false, error: "Enter a payment amount greater than zero." };
    }

    const supplier = get().suppliers.find((row) => row.id === supplierId);
    if (!supplier) return { ok: false, error: "Supplier not found." };

    let remaining = payment;
    const purchases = get().purchases.map((purchase) => {
      if (purchase.supplierId !== supplierId || remaining <= 0) return purchase;
      const due = Math.round((purchase.total - purchase.paid) * 100) / 100;
      if (!(due > 0)) return purchase;

      const applied = Math.min(due, remaining);
      remaining = Math.round((remaining - applied) * 100) / 100;
      const paid = Math.round((purchase.paid + applied) * 100) / 100;
      return {
        ...purchase,
        paid,
        due: Math.round((purchase.total - paid) * 100) / 100,
      };
    });

    const applied = Math.round((payment - remaining) * 100) / 100;
    if (!(applied > 0)) {
      return { ok: false, error: "This supplier has no outstanding balance." };
    }

    // Leftover payment becomes advance on the newest purchase for this supplier.
    if (remaining > 0) {
      let advanced = false;
      const withAdvance = purchases.map((purchase) => {
        if (advanced || purchase.supplierId !== supplierId) return purchase;
        advanced = true;
        const paid = Math.round((purchase.paid + remaining) * 100) / 100;
        return {
          ...purchase,
          paid,
          due: Math.round((purchase.total - paid) * 100) / 100,
        };
      });
      if (advanced) {
        set({ purchases: withAdvance });
        get().persist();
        return { ok: true, applied: payment };
      }
    }

    set({ purchases });
    get().persist();
    return { ok: true, applied };
  },
}));
