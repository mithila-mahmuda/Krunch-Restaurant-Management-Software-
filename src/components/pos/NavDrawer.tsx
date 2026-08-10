"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  CookingPot,
  LayoutGrid,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { navSectionsForRole } from "@/lib/nav";
import { useAuthStore } from "@/store/auth-store";
import { usePosStore } from "@/store/pos-store";
import { useRolesStore } from "@/store/roles-store";
import { useSettingsStore } from "@/store/settings-store";

const linkIcons = {
  "/pos": LayoutGrid,
  "/orders": ClipboardList,
  "/kitchen": CookingPot,
  "/tables": UtensilsCrossed,
  "/customers": Users,
  "/menu": Package,
  "/inventory": Boxes,
  "/item-purchase": ShoppingCart,
  "/reports": BarChart3,
  "/settings": Settings,
} as const;

export function NavDrawer() {
  const router = useRouter();
  const open = usePosStore((state) => state.navOpen);
  const setNavOpen = usePosStore((state) => state.setNavOpen);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const restaurantName = useSettingsStore((state) => state.restaurantName);
  const restaurantLogoDataUrl = useSettingsStore(
    (state) => state.restaurantLogoDataUrl,
  );
  // Re-render when role page access changes.
  useRolesStore((state) => state.roles);
  const pathname = usePathname();
  const brandName =
    restaurantName.trim() ||
    user?.restaurantName?.trim() ||
    "Krunch";
  const sections = navSectionsForRole(user?.role).map((section) => ({
    ...section,
    pages: section.pages.map((page) => ({
      ...page,
      icon: linkIcons[page.href as keyof typeof linkIcons],
    })),
  }));

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setNavOpen]);

  function handleSignOut() {
    setNavOpen(false);
    signOut();
    router.replace("/login");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Close navigation"
        onClick={() => setNavOpen(false)}
      />
      <aside className="relative z-10 flex h-full w-[min(100%,300px)] max-w-[85vw] flex-col bg-[var(--pos-header)] text-pos-on-header shadow-2xl animate-in pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-start justify-between gap-2 border-b border-pos-on-header/10 px-4 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {restaurantLogoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL logos from settings
              <img
                src={restaurantLogoDataUrl}
                alt=""
                className="mt-0.5 h-10 w-10 shrink-0 rounded-lg object-contain"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-[family-name:var(--font-display)] text-base font-bold leading-snug">
                {brandName}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-pos-on-header/70">
                Krunch Restaurant Management
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-pos-on-header/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-auto overscroll-contain p-3">
          <div className="space-y-4">
            {sections.map((section) => (
              <div key={section.id}>
                <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-pos-on-header/45">
                  {section.label}
                </p>
                <div className="space-y-1">
                  {section.pages.map((link) => {
                    const Icon = link.icon;
                    const active =
                      pathname === link.href ||
                      pathname.startsWith(`${link.href}/`);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setNavOpen(false)}
                        className={`flex min-h-12 items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition ${
                          active
                            ? "bg-[var(--pos-header-deep)] text-pos-on-header"
                            : "text-pos-on-header/90 hover:bg-pos-on-header/10"
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="truncate">{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-pos-on-header/10 p-3">
          <p className="truncate px-3 text-xs text-pos-on-header/65">
            Signed in as{" "}
            <span className="font-semibold text-pos-on-header/90">
              {user?.name ?? "Staff"}
            </span>
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold text-pos-on-header/90 transition hover:bg-pos-on-header/10"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}
