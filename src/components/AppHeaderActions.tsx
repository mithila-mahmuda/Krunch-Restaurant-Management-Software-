"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Moon, Search, Sun, UserRound } from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { UserAvatar } from "@/components/settings/UserAvatar";
import { applyAppearance } from "@/lib/appearance";
import { useAuthStore } from "@/store/auth-store";
import { usePosStore } from "@/store/pos-store";
import { useStaffStore } from "@/store/staff-store";

function subscribeDark(onStoreChange: () => void) {
  const root = document.documentElement;
  const observer = new MutationObserver(onStoreChange);
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function readIsDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function AppHeaderActions() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const staff = useStaffStore((state) => state.staff);
  const isDark = useSyncExternalStore(subscribeDark, readIsDark, () => false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const profile = user
    ? staff.find((row) => row.id === user.id && !row.archived)
    : undefined;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey) return;

      const isModK =
        event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey);
      if (!isModK) return;
      if (usePosStore.getState().navOpen) return;

      event.preventDefault();
      setSearchOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function toggleAppearance() {
    applyAppearance(isDark ? "light" : "dark");
  }

  function handleSignOut() {
    setMenuOpen(false);
    signOut();
    router.replace("/login");
  }

  return (
    <>
      <div className="app-header-cluster" role="group" aria-label="Tools">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="app-header-btn"
          aria-label="Search"
          aria-keyshortcuts="Control+K Meta+K"
          title="Search (Ctrl+K)"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>

      {user ? (
        <div
          className="app-header-cluster relative"
          role="group"
          aria-label="Account"
          ref={menuRef}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={user.name}
            className="app-header-btn app-header-btn--label max-w-[8.5rem] gap-2 tracking-wide sm:max-w-[10.5rem]"
          >
            <span className="rounded-full ring-2 ring-white/35">
              <UserAvatar
                name={user.name}
                seed={user.id}
                avatarDataUrl={profile?.avatarDataUrl}
                avatarEmoji={profile?.avatarEmoji}
                size="xs"
              />
            </span>
            <span className="hidden min-w-0 truncate sm:inline">
              {user.name}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label="Account menu"
              className="absolute right-0 top-full z-30 mt-1 min-w-[11.5rem] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-slate-800 shadow-lg"
            >
              <Link
                role="menuitem"
                href={`/settings/users/${user.id}`}
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
              >
                <UserRound className="h-4 w-4 text-slate-500" />
                View profile
              </Link>
              <button
                role="menuitem"
                type="button"
                onClick={toggleAppearance}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
              >
                {isDark ? (
                  <Sun className="h-4 w-4 text-slate-500" />
                ) : (
                  <Moon className="h-4 w-4 text-slate-500" />
                )}
                {isDark ? "Light mode" : "Dark mode"}
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
