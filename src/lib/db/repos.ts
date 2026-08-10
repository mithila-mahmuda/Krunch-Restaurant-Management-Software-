"use client";

import {
  clearStore,
  getAll,
  getById,
  getLocalDb,
  getTenantAll,
  putAll,
  putOne,
  putTenantAll,
} from "@/lib/db/client";
import { STORES } from "@/lib/db/schema";
import type {
  CustomerRecord,
  FloorTable,
  InventoryItem,
} from "@/lib/module-data";
import type { PurchaseEntry, Supplier } from "@/lib/purchases";
import { DEMO_RESTAURANT_ID } from "@/lib/tenant";
import type { CashDrawerEvent, Category, OpsOrder, Product } from "@/lib/types";
import {
  normalizeBranches,
  resolveActiveBranch,
  type Branch,
} from "@/lib/branches";
import type { AppRole } from "@/lib/roles";
import type { StaffUser } from "@/lib/staff";
import {
  ensureTillsForBranches,
  normalizeTills,
  resolveActiveTill,
  type TillStation,
} from "@/lib/tills";

export interface TillSettingsRow {
  restaurantId?: string;
  /** @deprecated Prefer active till name. Kept for legacy rows. */
  tillName: string;
  branches: Branch[];
  activeBranchId: string;
  tills: TillStation[];
  activeTillId: string;
  taxRate: number;
  taxInclusive: boolean;
  serviceRate: number;
  serviceDefault: boolean;
  kitchenSound: boolean;
  showDemoSeed: boolean;
  restaurantName: string;
  restaurantPhone: string;
  restaurantAddress: string;
  restaurantLogoDataUrl: string | null;
  /** Per-restaurant theme hex (`#rrggbb`), stored on the settings row. */
  brandColor?: string;
  /** ISO 4217 code only (e.g. GBP) — amounts stay numeric elsewhere. */
  currencyCode?: string;
}

export interface OpsSnapshot {
  orders: OpsOrder[];
  tables: FloorTable[];
  inventory: InventoryItem[];
  nextOrderNumber: number;
  floatAmount: number;
  cashEvents: CashDrawerEvent[];
}

export interface AuthSessionRow {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantId?: string;
  restaurantName?: string;
  activeBranchId?: string;
  activeTillId?: string;
}

export interface RestaurantAccountRow {
  id: string;
  restaurantName: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  password: string;
  createdAt: string;
}

type MetaRow = { id: string; value: string };
type SettingsRecord = Partial<TillSettingsRow> & {
  id: string;
  tillName?: string;
  taxRate: number;
  serviceRate: number;
  serviceDefault: boolean;
  kitchenSound: boolean;
  showDemoSeed: boolean;
};
type AuthRecord = {
  id: "current";
  userId: string;
  name: string;
  email: string;
  role: string;
  restaurantId?: string;
  restaurantName?: string;
  activeBranchId?: string;
  activeTillId?: string;
};

async function getMeta(key: string): Promise<string | null> {
  const db = await getLocalDb();
  const row = await getById<MetaRow>(db, STORES.meta, key);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  const db = await getLocalDb();
  await putOne(db, STORES.meta, { id: key, value });
}

function metaKey(restaurantId: string, key: string) {
  return `${key}:${restaurantId}`;
}

function parseSettingsRow(row: SettingsRecord): TillSettingsRow {
  const { branches, activeBranchId } = normalizeBranches(
    row.branches,
    row.activeBranchId,
    {
      name: row.restaurantName,
      phone: row.restaurantPhone,
      address: row.restaurantAddress,
      logoDataUrl: row.restaurantLogoDataUrl,
    },
  );
  const branch = resolveActiveBranch(branches, activeBranchId);
  const normalized = normalizeTills(
    row.tills,
    row.activeTillId,
    branch.id,
    row.tillName,
  );
  const activeTillId = normalized.activeTillId;
  const tills = ensureTillsForBranches(branches, normalized.tills);
  const activeTill = resolveActiveTill(tills, activeTillId, branch.id);

  return {
    restaurantId: row.restaurantId ?? row.id,
    tillName: activeTill.name,
    branches,
    activeBranchId: branch.id,
    tills,
    activeTillId: activeTill.id,
    taxRate: row.taxRate,
    taxInclusive: row.taxInclusive ?? true,
    serviceRate: row.serviceRate,
    serviceDefault: row.serviceDefault,
    kitchenSound: row.kitchenSound,
    showDemoSeed: row.showDemoSeed,
    restaurantName: row.restaurantName ?? "",
    restaurantPhone: branch.phone || row.restaurantPhone || "",
    restaurantAddress: branch.address || row.restaurantAddress || "",
    restaurantLogoDataUrl: row.restaurantLogoDataUrl ?? null,
    brandColor: row.brandColor || undefined,
    currencyCode: row.currencyCode || undefined,
  };
}

export async function loadOpsSnapshot(
  restaurantId: string,
): Promise<OpsSnapshot | null> {
  const db = await getLocalDb();
  const orders = await getTenantAll<OpsOrder>(
    db,
    STORES.orders,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
  const seeded =
    (await getMeta(metaKey(restaurantId, "ops_seeded"))) === "1" ||
    (restaurantId === DEMO_RESTAURANT_ID &&
      (await getMeta("ops_seeded")) === "1");

  if (orders.length === 0 && !seeded) {
    return null;
  }

  const tables = await getTenantAll<FloorTable>(
    db,
    STORES.floor_tables,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
  const inventory = await getTenantAll<InventoryItem>(
    db,
    STORES.inventory_items,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
  const cashEvents = await getTenantAll<CashDrawerEvent>(
    db,
    STORES.cash_events,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );

  const nextOrderNumber = Number(
    (await getMeta(metaKey(restaurantId, "next_order_number"))) ??
      (restaurantId === DEMO_RESTAURANT_ID
        ? await getMeta("next_order_number")
        : null) ??
      "1100",
  );
  const floatAmount = Number(
    (await getMeta(metaKey(restaurantId, "float_amount"))) ??
      (restaurantId === DEMO_RESTAURANT_ID
        ? await getMeta("float_amount")
        : null) ??
      "150",
  );

  return {
    orders,
    tables,
    inventory,
    nextOrderNumber,
    floatAmount,
    cashEvents,
  };
}

export async function saveOpsSnapshot(
  restaurantId: string,
  snapshot: OpsSnapshot,
): Promise<void> {
  const db = await getLocalDb();
  const stamp = <T extends { id: string }>(rows: T[]) =>
    rows.map((row) => ({ ...row, restaurantId }));

  await putTenantAll(
    db,
    STORES.orders,
    restaurantId,
    stamp(snapshot.orders),
    DEMO_RESTAURANT_ID,
  );
  await putTenantAll(
    db,
    STORES.floor_tables,
    restaurantId,
    stamp(snapshot.tables),
    DEMO_RESTAURANT_ID,
  );
  await putTenantAll(
    db,
    STORES.inventory_items,
    restaurantId,
    stamp(snapshot.inventory),
    DEMO_RESTAURANT_ID,
  );
  await putTenantAll(
    db,
    STORES.cash_events,
    restaurantId,
    stamp(snapshot.cashEvents),
    DEMO_RESTAURANT_ID,
  );
  await setMeta(
    metaKey(restaurantId, "next_order_number"),
    String(snapshot.nextOrderNumber),
  );
  await setMeta(
    metaKey(restaurantId, "float_amount"),
    String(snapshot.floatAmount),
  );
  await setMeta(metaKey(restaurantId, "ops_seeded"), "1");
}

export async function loadCustomers(
  restaurantId: string,
): Promise<CustomerRecord[]> {
  const db = await getLocalDb();
  return getTenantAll<CustomerRecord>(
    db,
    STORES.customers,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
}

export async function saveCustomers(
  restaurantId: string,
  customers: CustomerRecord[],
): Promise<void> {
  const db = await getLocalDb();
  await putTenantAll(
    db,
    STORES.customers,
    restaurantId,
    customers.map((row) => ({ ...row, restaurantId })),
    DEMO_RESTAURANT_ID,
  );
}

export async function loadSuppliers(
  restaurantId: string,
): Promise<Supplier[]> {
  const db = await getLocalDb();
  return getTenantAll<Supplier>(
    db,
    STORES.suppliers,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
}

export async function saveSuppliers(
  restaurantId: string,
  suppliers: Supplier[],
): Promise<void> {
  const db = await getLocalDb();
  await putTenantAll(
    db,
    STORES.suppliers,
    restaurantId,
    suppliers.map((row) => ({ ...row, restaurantId })),
    DEMO_RESTAURANT_ID,
  );
}

export async function loadPurchases(
  restaurantId: string,
): Promise<PurchaseEntry[]> {
  const db = await getLocalDb();
  return getTenantAll<PurchaseEntry>(
    db,
    STORES.purchases,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
}

export async function savePurchases(
  restaurantId: string,
  purchases: PurchaseEntry[],
): Promise<void> {
  const db = await getLocalDb();
  await putTenantAll(
    db,
    STORES.purchases,
    restaurantId,
    purchases.map((row) => ({ ...row, restaurantId })),
    DEMO_RESTAURANT_ID,
  );
}

export async function loadCatalog(restaurantId: string): Promise<Product[]> {
  const db = await getLocalDb();
  return getTenantAll<Product>(
    db,
    STORES.products,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
}

export async function saveCatalog(
  restaurantId: string,
  products: Product[],
): Promise<void> {
  const db = await getLocalDb();
  await putTenantAll(
    db,
    STORES.products,
    restaurantId,
    products.map((row) => ({ ...row, restaurantId })),
    DEMO_RESTAURANT_ID,
  );
}

export async function loadCategories(
  restaurantId: string,
): Promise<Category[]> {
  const db = await getLocalDb();
  return getTenantAll<Category>(
    db,
    STORES.categories,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
}

export async function saveCategories(
  restaurantId: string,
  categories: Category[],
): Promise<void> {
  const db = await getLocalDb();
  await putTenantAll(
    db,
    STORES.categories,
    restaurantId,
    categories.map((row) => ({ ...row, restaurantId })),
    DEMO_RESTAURANT_ID,
  );
}

export async function loadTillSettings(
  restaurantId: string,
): Promise<TillSettingsRow | null> {
  const db = await getLocalDb();
  let row = await getById<SettingsRecord>(
    db,
    STORES.till_settings,
    restaurantId,
  );

  // Migrate legacy singleton settings into the demo restaurant.
  if (!row && restaurantId === DEMO_RESTAURANT_ID) {
    row = await getById<SettingsRecord>(db, STORES.till_settings, "current");
  }
  if (!row) return null;

  return parseSettingsRow({ ...row, restaurantId });
}

export async function saveTillSettings(
  restaurantId: string,
  settings: TillSettingsRow,
): Promise<void> {
  const db = await getLocalDb();
  await putOne(db, STORES.till_settings, {
    id: restaurantId,
    ...settings,
    restaurantId,
  });
}

export async function loadAuthSession(): Promise<AuthSessionRow | null> {
  const db = await getLocalDb();
  const row = await getById<AuthRecord>(db, STORES.auth_sessions, "current");
  if (!row?.userId) return null;
  return {
    id: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    restaurantId: row.restaurantId,
    restaurantName: row.restaurantName,
    activeBranchId: row.activeBranchId,
    activeTillId: row.activeTillId,
  };
}

export async function saveAuthSession(session: AuthSessionRow): Promise<void> {
  const db = await getLocalDb();
  await putOne(db, STORES.auth_sessions, {
    id: "current",
    userId: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    restaurantId: session.restaurantId,
    restaurantName: session.restaurantName,
    activeBranchId: session.activeBranchId,
    activeTillId: session.activeTillId,
  });
}

export async function clearAuthSession(): Promise<void> {
  const db = await getLocalDb();
  await clearStore(db, STORES.auth_sessions);
}

export async function loadRestaurantAccounts(): Promise<RestaurantAccountRow[]> {
  const db = await getLocalDb();
  return getAll<RestaurantAccountRow>(db, STORES.restaurant_accounts);
}

export async function saveRestaurantAccounts(
  accounts: RestaurantAccountRow[],
): Promise<void> {
  const db = await getLocalDb();
  await putAll(db, STORES.restaurant_accounts, accounts);
}

/** All staff across restaurants — used for login email lookup. */
export async function loadAllStaffUsers(): Promise<StaffUser[]> {
  const db = await getLocalDb();
  return getAll<StaffUser>(db, STORES.staff_users);
}

export async function loadStaffUsers(
  restaurantId: string,
): Promise<StaffUser[]> {
  const db = await getLocalDb();
  return getTenantAll<StaffUser>(
    db,
    STORES.staff_users,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
}

export async function saveStaffUsers(
  restaurantId: string,
  staff: StaffUser[],
): Promise<void> {
  const db = await getLocalDb();
  await putTenantAll(
    db,
    STORES.staff_users,
    restaurantId,
    staff.map((row) => ({ ...row, restaurantId })),
    DEMO_RESTAURANT_ID,
  );
}

export async function loadAppRoles(restaurantId: string): Promise<AppRole[]> {
  const db = await getLocalDb();
  return getTenantAll<AppRole>(
    db,
    STORES.app_roles,
    restaurantId,
    DEMO_RESTAURANT_ID,
  );
}

export async function saveAppRoles(
  restaurantId: string,
  roles: AppRole[],
): Promise<void> {
  const db = await getLocalDb();
  await putTenantAll(
    db,
    STORES.app_roles,
    restaurantId,
    roles.map((row) => ({ ...row, restaurantId })),
    DEMO_RESTAURANT_ID,
  );
}

export async function getMigrationFlag(): Promise<boolean> {
  return (await getMeta("legacy_json_migrated_v1")) === "1";
}

export async function setMigrationFlag(): Promise<void> {
  await setMeta("legacy_json_migrated_v1", "1");
}
