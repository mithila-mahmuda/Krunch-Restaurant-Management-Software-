"use client";

import {
  hydrateRestaurantAccounts,
  readRestaurantAccounts,
  type RestaurantAccount,
} from "@/lib/restaurants";
import {
  loadRestaurantAccounts,
  saveRestaurantAccounts,
} from "@/lib/db/repos";
import { setActiveCurrencyCode } from "@/lib/active-currency";
import { clearBrandColor } from "@/lib/brand-color";
import { DEFAULT_CURRENCY_CODE } from "@/lib/currency";
import { DEMO_RESTAURANT_ID } from "@/lib/tenant";
import { useCatalogStore } from "@/store/catalog-store";
import { useCustomerStore } from "@/store/customer-store";
import { useOpsStore } from "@/store/ops-store";
import { usePosStore } from "@/store/pos-store";
import { usePurchaseStore } from "@/store/purchase-store";
import { useRolesStore } from "@/store/roles-store";
import { useSettingsStore } from "@/store/settings-store";
import { useStaffStore } from "@/store/staff-store";

let activeWorkspaceId: string | null = null;

export function getActiveWorkspaceId(): string | null {
  return activeWorkspaceId;
}

/** Ensure the demo restaurant account exists for seed staff logins. */
export async function ensureDemoRestaurantAccount(): Promise<RestaurantAccount> {
  await hydrateRestaurantAccounts();
  const existing = readRestaurantAccounts().find(
    (account) => account.id === DEMO_RESTAURANT_ID,
  );
  if (existing) return existing;

  const rows = await loadRestaurantAccounts();
  const already = rows.find((row) => row.id === DEMO_RESTAURANT_ID);
  if (already) {
    await hydrateRestaurantAccounts();
    return {
      id: already.id,
      restaurantName: already.restaurantName,
      ownerName: already.ownerName,
      email: already.email,
      contactNumber: already.contactNumber,
      password: already.password,
      createdAt: already.createdAt,
    };
  }

  const demo: RestaurantAccount = {
    id: DEMO_RESTAURANT_ID,
    restaurantName: "Krunch Demo",
    ownerName: "Kyle",
    email: "demo-owner@krunch.app",
    contactNumber: "01700000000",
    password: "demo-owner-not-used",
    createdAt: new Date().toISOString(),
  };
  await saveRestaurantAccounts([
    ...rows,
    {
      id: demo.id,
      restaurantName: demo.restaurantName,
      ownerName: demo.ownerName,
      email: demo.email,
      contactNumber: demo.contactNumber,
      password: demo.password,
      createdAt: demo.createdAt,
    },
  ]);
  await hydrateRestaurantAccounts();
  return demo;
}

/**
 * Load (or switch to) one restaurant's workspace in memory.
 * Other restaurants' IndexedDB rows stay on disk, untouched.
 */
export async function loadRestaurantWorkspace(
  restaurantId: string,
  options?: { force?: boolean },
): Promise<void> {
  if (
    !options?.force &&
    activeWorkspaceId === restaurantId &&
    useSettingsStore.getState().hydrated &&
    useSettingsStore.getState().restaurantId === restaurantId
  ) {
    return;
  }

  activeWorkspaceId = restaurantId;

  await useSettingsStore.getState().hydrateForRestaurant(restaurantId);
  await useRolesStore.getState().hydrateForRestaurant(restaurantId);
  await useStaffStore.getState().hydrateForRestaurant(restaurantId);
  await useCatalogStore.getState().hydrateForRestaurant(restaurantId);
  await useCustomerStore.getState().hydrateForRestaurant(restaurantId);
  await useOpsStore.getState().hydrateForRestaurant(restaurantId);
  await usePurchaseStore.getState().hydrateForRestaurant(restaurantId);
  usePosStore.getState().applyServiceDefault();
}

export async function clearRestaurantWorkspace(): Promise<void> {
  activeWorkspaceId = null;
  clearBrandColor();
  setActiveCurrencyCode(DEFAULT_CURRENCY_CODE);
  useSettingsStore.setState({ restaurantId: null, hydrated: false });
  useRolesStore.setState({ restaurantId: null, roles: [], hydrated: false });
  useStaffStore.setState({ restaurantId: null, staff: [], hydrated: false });
  useCatalogStore.setState({
    restaurantId: null,
    categories: [],
    products: [],
    hydrated: false,
  });
  useCustomerStore.setState({ restaurantId: null, hydrated: false });
  useOpsStore.setState({ restaurantId: null, hydrated: false });
  usePurchaseStore.setState({
    restaurantId: null,
    suppliers: [],
    purchases: [],
    hydrated: false,
  });
}

/** Resolve which restaurant a signed-in user belongs to. */
export function resolveSessionRestaurantId(input: {
  restaurantId?: string;
  email?: string;
  id?: string;
}): string | null {
  if (input.restaurantId) return input.restaurantId;
  if (input.id?.startsWith("rest_")) return input.id;
  const account = input.email
    ? readRestaurantAccounts().find(
        (row) => row.email === input.email?.trim().toLowerCase(),
      )
    : null;
  if (account) return account.id;
  return DEMO_RESTAURANT_ID;
}
