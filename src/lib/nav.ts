import {
  can,
  PATH_PERMISSIONS,
  type Permission,
  type RoleId,
} from "@/lib/permissions";

export type NavSectionId = "service" | "management" | "business";

export type NavPage = {
  href: string;
  label: string;
  keywords: string[];
  permission: Permission;
  section: NavSectionId;
};

export type NavSection = {
  id: NavSectionId;
  label: string;
};

export const NAV_SECTIONS: NavSection[] = [
  { id: "service", label: "Service" },
  { id: "management", label: "Management" },
  { id: "business", label: "Business" },
];

export const NAV_PAGES: NavPage[] = [
  {
    href: "/pos",
    label: "POS Till",
    keywords: ["till", "point of sale", "register", "sale"],
    permission: PATH_PERMISSIONS["/pos"]!,
    section: "service",
  },
  {
    href: "/orders",
    label: "Orders",
    keywords: ["tickets", "held", "paid", "history"],
    permission: PATH_PERMISSIONS["/orders"]!,
    section: "service",
  },
  {
    href: "/kitchen",
    label: "Kitchen Display",
    keywords: ["kds", "prep", "cook", "tickets"],
    permission: PATH_PERMISSIONS["/kitchen"]!,
    section: "service",
  },
  {
    href: "/tables",
    label: "Tabs & Tables",
    keywords: ["floor", "seats", "dining", "tabs"],
    permission: PATH_PERMISSIONS["/tables"]!,
    section: "service",
  },
  {
    href: "/customers",
    label: "Customers",
    keywords: ["guests", "loyalty", "crm"],
    permission: PATH_PERMISSIONS["/customers"]!,
    section: "management",
  },
  {
    href: "/menu",
    label: "Menu Manager",
    keywords: ["catalog", "products", "prices", "items"],
    permission: PATH_PERMISSIONS["/menu"]!,
    section: "management",
  },
  {
    href: "/inventory",
    label: "Inventory",
    keywords: ["stock", "target", "par", "supplies"],
    permission: PATH_PERMISSIONS["/inventory"]!,
    section: "management",
  },
  {
    href: "/reports",
    label: "Reports",
    keywords: ["analytics", "sales", "revenue"],
    permission: PATH_PERMISSIONS["/reports"]!,
    section: "business",
  },
  {
    href: "/settings",
    label: "Settings",
    keywords: ["preferences", "till", "appearance", "staff", "users"],
    permission: PATH_PERMISSIONS["/settings"]!,
    section: "business",
  },
];

export function navPagesForRole(roleId: RoleId | undefined | null): NavPage[] {
  return NAV_PAGES.filter((page) => can(roleId, page.permission));
}

export function navSectionsForRole(roleId: RoleId | undefined | null): {
  id: NavSectionId;
  label: string;
  pages: NavPage[];
}[] {
  const pages = navPagesForRole(roleId);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    pages: pages.filter((page) => page.section === section.id),
  })).filter((section) => section.pages.length > 0);
}
