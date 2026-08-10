import type { Permission } from "@/lib/permissions";

export type AppRole = {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId?: string;
  name: string;
  permissions: Permission[];
  /** Seeded defaults — can edit access, but keep at least one admin-capable role. */
  builtIn: boolean;
  archived: boolean;
  createdAt: string;
};

export type PageAccessOption = {
  permission: Permission;
  label: string;
  description: string;
  /** Extra permissions granted/removed with this page toggle. */
  linked?: Permission[];
};

/** Page-wise access toggles shown in role editor. */
export const PAGE_ACCESS_OPTIONS: PageAccessOption[] = [
  {
    permission: "access_pos",
    label: "POS Till",
    description: "Ring sales on the till",
  },
  {
    permission: "access_orders",
    label: "Orders",
    description: "View and manage tickets",
  },
  {
    permission: "access_kitchen",
    label: "Kitchen Display",
    description: "Prep tickets",
  },
  {
    permission: "access_tables",
    label: "Tabs & Tables",
    description: "Floor plan and open tabs",
  },
  {
    permission: "access_customers",
    label: "Customers",
    description: "Guest list and profiles",
  },
  {
    permission: "access_menu",
    label: "Menu Manager",
    description: "Prices and availability",
    linked: ["edit_menu"],
  },
  {
    permission: "access_inventory",
    label: "Inventory",
    description: "Stock levels",
    linked: ["adjust_inventory"],
  },
  {
    permission: "access_purchases",
    label: "Item Purchase",
    description: "Buy stock from suppliers",
    linked: ["adjust_inventory"],
  },
  {
    permission: "access_reports",
    label: "Reports",
    description: "Sales and cash insights",
  },
  {
    permission: "access_settings",
    label: "Settings",
    description: "Venue config and users",
    linked: ["edit_settings", "manage_users"],
  },
];

export type ActionAccessOption = {
  permission: Permission;
  label: string;
  description: string;
};

/** Till actions independent of which pages are open. */
export const ACTION_ACCESS_OPTIONS: ActionAccessOption[] = [
  {
    permission: "void_order",
    label: "Void orders",
    description: "Cancel tickets on the till",
  },
  {
    permission: "apply_discount",
    label: "Apply discounts",
    description: "Manual line discounts",
  },
  {
    permission: "open_drawer",
    label: "Open cash drawer",
    description: "No-sale drawer opens",
  },
  {
    permission: "adjust_float",
    label: "Adjust float / petty cash",
    description: "Change drawer float",
  },
];

/** Full access — Admin only by default. */
export const ALL_PERMISSIONS: Permission[] = [
  "access_pos",
  "access_orders",
  "access_kitchen",
  "access_tables",
  "access_customers",
  "access_menu",
  "access_inventory",
  "access_purchases",
  "access_reports",
  "access_settings",
  "void_order",
  "apply_discount",
  "open_drawer",
  "adjust_float",
  "edit_settings",
  "manage_users",
  "edit_menu",
  "adjust_inventory",
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  /** Day-to-day lead — not user/role admin. */
  manager: [
    "access_pos",
    "access_orders",
    "access_kitchen",
    "access_tables",
    "access_customers",
    "access_menu",
    "access_inventory",
    "access_purchases",
    "access_reports",
    "access_settings",
    "void_order",
    "apply_discount",
    "open_drawer",
    "adjust_float",
    "edit_settings",
    "edit_menu",
    "adjust_inventory",
  ],
  cashier: [
    "access_pos",
    "access_orders",
    "access_kitchen",
    "access_tables",
    "access_customers",
    "access_inventory",
    "access_purchases",
    "access_reports",
    "void_order",
    "apply_discount",
    "open_drawer",
    "adjust_float",
    "adjust_inventory",
  ],
  server: [
    "access_pos",
    "access_orders",
    "access_kitchen",
    "access_tables",
    "access_customers",
    "apply_discount",
  ],
};

export function createDefaultRoles(restaurantId: string): AppRole[] {
  const createdAt = new Date().toISOString();
  const idFor = (key: string) => `${restaurantId}:${key}`;
  return [
    {
      id: idFor("admin"),
      restaurantId,
      name: "Admin",
      permissions: [...DEFAULT_ROLE_PERMISSIONS.admin!],
      builtIn: true,
      archived: false,
      createdAt,
    },
    {
      id: idFor("manager"),
      restaurantId,
      name: "Manager",
      permissions: [...DEFAULT_ROLE_PERMISSIONS.manager!],
      builtIn: true,
      archived: false,
      createdAt,
    },
    {
      id: idFor("cashier"),
      restaurantId,
      name: "Cashier",
      permissions: [...DEFAULT_ROLE_PERMISSIONS.cashier!],
      builtIn: true,
      archived: false,
      createdAt,
    },
    {
      id: idFor("server"),
      restaurantId,
      name: "Server",
      permissions: [...DEFAULT_ROLE_PERMISSIONS.server!],
      builtIn: true,
      archived: false,
      createdAt,
    },
  ];
}

/** Insert Admin and strip manage_users from Manager on older installs. */
export function migrateRolesTowardAdmin(
  roles: AppRole[],
  restaurantId: string,
): {
  roles: AppRole[];
  changed: boolean;
  adminInserted: boolean;
} {
  const defaults = createDefaultRoles(restaurantId);
  const adminId = `${restaurantId}:admin`;
  const managerId = `${restaurantId}:manager`;
  const adminSeed = defaults.find((role) => role.id === adminId)!;
  let next = [...roles];
  let changed = false;
  let adminInserted = false;

  // Claim legacy bare role ids into this restaurant.
  next = next.map((role) => {
    if (role.id.includes(":")) return role;
    changed = true;
    return {
      ...role,
      id: `${restaurantId}:${role.id}`,
      restaurantId,
    };
  });

  if (!next.some((role) => role.id === adminId && !role.archived)) {
    next = [{ ...adminSeed, createdAt: new Date().toISOString() }, ...next];
    changed = true;
    adminInserted = true;
  }

  next = next.map((role) => {
    if (role.id !== managerId && !role.id.endsWith(":manager")) return role;
    if (!role.permissions.includes("manage_users")) return role;
    changed = true;
    return {
      ...role,
      permissions: role.permissions.filter(
        (permission) => permission !== "manage_users",
      ),
    };
  });

  // Grant Item Purchase to roles that already manage inventory stock.
  next = next.map((role) => {
    if (
      !role.permissions.includes("access_inventory") ||
      role.permissions.includes("access_purchases")
    ) {
      return role;
    }
    changed = true;
    return {
      ...role,
      permissions: [...role.permissions, "access_purchases"],
    };
  });

  return { roles: next, changed, adminInserted };
}

export function newRoleId(): string {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function togglePagePermission(
  current: Permission[],
  option: PageAccessOption,
  enabled: boolean,
): Permission[] {
  const next = new Set(current);
  if (enabled) {
    next.add(option.permission);
    for (const linked of option.linked ?? []) next.add(linked);
  } else {
    next.delete(option.permission);
    for (const linked of option.linked ?? []) next.delete(linked);
  }
  return [...next];
}

export function toggleActionPermission(
  current: Permission[],
  permission: Permission,
  enabled: boolean,
): Permission[] {
  const next = new Set(current);
  if (enabled) next.add(permission);
  else next.delete(permission);
  return [...next];
}

export function roleHasPermission(
  role: AppRole | undefined | null,
  permission: Permission,
): boolean {
  return Boolean(role && !role.archived && role.permissions.includes(permission));
}
