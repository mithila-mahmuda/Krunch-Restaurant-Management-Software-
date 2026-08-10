import {
  can,
  PATH_PERMISSIONS,
  type Permission,
  type RoleId,
} from "@/lib/permissions";

export type NavPage = {
  href: string;
  label: string;
  keywords: string[];
  permission: Permission;
};

export const NAV_PAGES: NavPage[] = [
  {
    href: "/pos",
    label: "POS Till",
    keywords: ["till", "point of sale", "register", "sale"],
    permission: PATH_PERMISSIONS["/pos"]!,
  },
  {
    href: "/orders",
    label: "Orders",
    keywords: ["tickets", "held", "paid", "history"],
    permission: PATH_PERMISSIONS["/orders"]!,
  },
  {
    href: "/kitchen",
    label: "Kitchen Display",
    keywords: ["kds", "prep", "cook", "tickets"],
    permission: PATH_PERMISSIONS["/kitchen"]!,
  },
  {
    href: "/tables",
    label: "Tabs & Tables",
    keywords: ["floor", "seats", "dining", "tabs"],
    permission: PATH_PERMISSIONS["/tables"]!,
  },
  {
    href: "/customers",
    label: "Customers",
    keywords: ["guests", "loyalty", "crm"],
    permission: PATH_PERMISSIONS["/customers"]!,
  },
  {
    href: "/menu",
    label: "Menu Manager",
    keywords: ["catalog", "products", "prices", "items"],
    permission: PATH_PERMISSIONS["/menu"]!,
  },
  {
    href: "/inventory",
    label: "Inventory",
    keywords: ["stock", "target", "par", "supplies"],
    permission: PATH_PERMISSIONS["/inventory"]!,
  },
  {
    href: "/reports",
    label: "Reports",
    keywords: ["analytics", "sales", "revenue"],
    permission: PATH_PERMISSIONS["/reports"]!,
  },
  {
    href: "/settings",
    label: "Settings",
    keywords: ["preferences", "till", "appearance", "staff", "users"],
    permission: PATH_PERMISSIONS["/settings"]!,
  },
];

export function navPagesForRole(roleId: RoleId | undefined | null): NavPage[] {
  return NAV_PAGES.filter((page) => can(roleId, page.permission));
}
