import {
  DEFAULT_ROLE_PERMISSIONS,
  type AppRole,
} from "@/lib/roles";
import { roleKeyFromId } from "@/lib/tenant";

export type Permission =
  | "access_pos"
  | "access_orders"
  | "access_kitchen"
  | "access_tables"
  | "access_customers"
  | "access_menu"
  | "access_inventory"
  | "access_reports"
  | "access_settings"
  | "void_order"
  | "apply_discount"
  | "open_drawer"
  | "adjust_float"
  | "edit_settings"
  | "manage_users"
  | "edit_menu"
  | "adjust_inventory";

/** Page href → permission required to open it. */
export const PATH_PERMISSIONS: Record<string, Permission> = {
  "/pos": "access_pos",
  "/orders": "access_orders",
  "/kitchen": "access_kitchen",
  "/tables": "access_tables",
  "/customers": "access_customers",
  "/menu": "access_menu",
  "/inventory": "access_inventory",
  "/reports": "access_reports",
  "/settings/users": "manage_users",
  "/settings": "access_settings",
};

/** Role id (e.g. manager, cashier, or a custom role-*). */
export type RoleId = string;

type RoleLookup = (roleId: string) => AppRole | undefined;

let roleLookup: RoleLookup | null = null;

/** Wired from the roles store after hydrate so `can()` stays sync. */
export function registerRoleLookup(lookup: RoleLookup) {
  roleLookup = lookup;
}

function permissionsForRole(roleId: string | undefined | null): Permission[] {
  if (!roleId) return [];

  const live = roleLookup?.(roleId);
  if (live && !live.archived) return live.permissions;

  return (
    DEFAULT_ROLE_PERMISSIONS[roleId] ??
    DEFAULT_ROLE_PERMISSIONS[roleKeyFromId(roleId)] ??
    []
  );
}

export function can(
  roleId: RoleId | undefined | null,
  permission: Permission,
): boolean {
  return permissionsForRole(roleId).includes(permission);
}

export function permissionForPath(pathname: string): Permission | null {
  const path = pathname.split("?")[0] ?? pathname;
  if (PATH_PERMISSIONS[path]) return PATH_PERMISSIONS[path];

  const match = Object.keys(PATH_PERMISSIONS)
    .sort((a, b) => b.length - a.length)
    .find((href) => path === href || path.startsWith(`${href}/`));
  return match ? PATH_PERMISSIONS[match]! : null;
}

export function canAccessPath(
  roleId: RoleId | undefined | null,
  pathname: string,
): boolean {
  const permission = permissionForPath(pathname);
  if (!permission) return Boolean(roleId);
  return can(roleId, permission);
}

/** First allowed app page for this role (fallback when a route is denied). */
export function homePathForRole(roleId: RoleId | undefined | null): string {
  const order = [
    "/pos",
    "/orders",
    "/tables",
    "/kitchen",
    "/customers",
    "/reports",
    "/inventory",
    "/menu",
    "/settings",
  ] as const;

  for (const href of order) {
    if (canAccessPath(roleId, href)) return href;
  }
  return "/login";
}

export function assertCan(
  roleId: RoleId | undefined | null,
  permission: Permission,
): { ok: true } | { ok: false; error: string } {
  if (can(roleId, permission)) return { ok: true };
  return { ok: false, error: "You do not have permission for this action." };
}
