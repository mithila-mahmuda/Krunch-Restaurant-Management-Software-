/**
 * IndexedDB object stores — same table names you'd use on RDS later.
 * Orders keep line items nested for simplicity; split to `order_lines` in Postgres.
 */
export const DB_NAME = "krunch";
export const DB_VERSION = 7;

export const STORES = {
  meta: "meta",
  orders: "orders",
  floor_tables: "floor_tables",
  inventory_items: "inventory_items",
  customers: "customers",
  products: "products",
  categories: "categories",
  till_settings: "till_settings",
  auth_sessions: "auth_sessions",
  restaurant_accounts: "restaurant_accounts",
  cash_events: "cash_events",
  staff_users: "staff_users",
  app_roles: "app_roles",
  suppliers: "suppliers",
  purchases: "purchases",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];
