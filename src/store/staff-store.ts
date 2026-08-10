"use client";

import { create } from "zustand";
import { loadStaffUsers, saveStaffUsers } from "@/lib/db/repos";
import { queueDbWrite } from "@/lib/db/write";
import { assertCan, can } from "@/lib/permissions";
import { hasAllBranchAccess } from "@/lib/branch-access";
import {
  assignDemoStaffBranches,
  createDemoStaff,
  newStaffId,
  type StaffRole,
  type StaffUser,
} from "@/lib/staff";
import { resolveStaffAvatarEmoji, staffAvatarEmoji } from "@/lib/staff-avatar";
import {
  DEMO_RESTAURANT_ID,
  roleIdForRestaurant,
  roleKeyFromId,
} from "@/lib/tenant";
import { useSettingsStore } from "@/store/settings-store";

function currentRole(): StaffRole | null {
  // Read from the auth singleton without importing auth-store (avoids a cycle).
  const auth = (
    globalThis as typeof globalThis & {
      __krunchAuthStore?: {
        getState: () => { user: { role: StaffRole } | null };
      };
    }
  ).__krunchAuthStore;
  return auth?.getState().user?.role ?? null;
}

function publishAssignedRoleIds(staff: StaffUser[]) {
  (
    globalThis as typeof globalThis & {
      __krunchStaffAssignedRoleIds?: () => string[];
    }
  ).__krunchStaffAssignedRoleIds = () =>
      staff.filter((row) => !row.archived).map((row) => row.role);
}

function adminUserCount(staff: StaffUser[], excludeId?: string) {
  return staff.filter(
    (row) =>
      !row.archived &&
      row.id !== excludeId &&
      can(row.role, "manage_users"),
  ).length;
}

export type StaffInput = {
  name: string;
  mobile: string;
  email: string;
  role: StaffRole;
  branchId: string;
  password: string;
  avatarDataUrl?: string | null;
  avatarEmoji?: string | null;
};

interface StaffState {
  restaurantId: string | null;
  staff: StaffUser[];
  hydrated: boolean;
  hydrateForRestaurant: (restaurantId: string) => Promise<void>;
  hydrate: () => Promise<void>;
  listActive: () => StaffUser[];
  findByCredentials: (email: string, password: string) => StaffUser | null;
  findById: (id: string) => StaffUser | null;
  createStaff: (
    input: StaffInput,
  ) => { ok: true; staff: StaffUser } | { ok: false; error: string };
  updateStaff: (
    id: string,
    input: Partial<StaffInput>,
  ) => { ok: true } | { ok: false; error: string };
  archiveStaff: (id: string) => { ok: true } | { ok: false; error: string };
  /** After Admin role is introduced, ensure someone can manage users. */
  ensureAdminAssignee: () => void;
}

function persist(staff: StaffUser[]) {
  publishAssignedRoleIds(staff);
  const restaurantId = useStaffStore.getState().restaurantId;
  if (!restaurantId) return;
  queueDbWrite(() => saveStaffUsers(restaurantId, staff), "save staff");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateInput(
  input: StaffInput,
  staff: StaffUser[],
  excludeId?: string,
): string | null {
  const name = input.name.trim();
  const mobile = input.mobile.trim();
  const email = normalizeEmail(input.email);
  const password = input.password.trim();

  if (!name) return "Enter a name.";
  if (!mobile) return "Enter a mobile number.";
  if (!email || !email.includes("@")) return "Enter a valid email.";
  if (!input.branchId) return "Assign a branch.";
  if (
    !hasAllBranchAccess(input.branchId) &&
    !useSettingsStore
      .getState()
      .branches.some(
        (branch) => branch.id === input.branchId && !branch.archived,
      )
  ) {
    return "Assign a valid branch.";
  }
  if (!input.role) return "Assign a role.";
  if (!password || password.length < 4) {
    return "Password must be at least 4 characters.";
  }

  const emailTaken = staff.some(
    (row) =>
      !row.archived &&
      row.id !== excludeId &&
      normalizeEmail(row.email) === email,
  );
  if (emailTaken) return "That email is already in use.";

  return null;
}

export const useStaffStore = create<StaffState>((set, get) => ({
  restaurantId: null,
  staff: [],
  hydrated: false,

  hydrateForRestaurant: async (restaurantId) => {
    if (get().hydrated && get().restaurantId === restaurantId) return;
    const loaded = await loadStaffUsers(restaurantId);
    const branchId =
      useSettingsStore.getState().branches.find((branch) => !branch.archived)
        ?.id ?? useSettingsStore.getState().activeBranchId;

    const branchIds = new Set(
      useSettingsStore
        .getState()
        .branches.filter((branch) => !branch.archived)
        .map((branch) => branch.id),
    );

    const isDemo = restaurantId === DEMO_RESTAURANT_ID;
    let emojiBackfill = false;
    const base =
      loaded.length > 0
        ? loaded.map((row) => {
          const avatarEmoji = resolveStaffAvatarEmoji(row.id, row.avatarEmoji);
          if (row.avatarEmoji !== avatarEmoji) emojiBackfill = true;
          return {
            ...row,
            restaurantId: row.restaurantId ?? restaurantId,
            mobile: row.mobile ?? "",
            branchId: row.branchId || branchId,
            avatarEmoji,
            archived: Boolean(row.archived),
            createdAt: row.createdAt || new Date().toISOString(),
          };
        })
        : isDemo
          ? createDemoStaff(branchId)
          : [];

    const migrated = isDemo
      ? assignDemoStaffBranches(base, branchIds)
      : { staff: base, changed: false };
    const staff = migrated.staff;
    const changed = migrated.changed || emojiBackfill;

    publishAssignedRoleIds(staff);
    set({ restaurantId, staff, hydrated: true });
    if (loaded.length === 0 || changed) {
      persist(staff);
    }
  },

  hydrate: async () => {
    await get().hydrateForRestaurant(get().restaurantId ?? DEMO_RESTAURANT_ID);
  },

  listActive: () => get().staff.filter((row) => !row.archived),

  findByCredentials: (email, password) => {
    const normalized = normalizeEmail(email);
    return (
      get().staff.find(
        (row) =>
          !row.archived &&
          normalizeEmail(row.email) === normalized &&
          row.password === password,
      ) ?? null
    );
  },

  findById: (id) => get().staff.find((row) => row.id === id) ?? null,

  createStaff: (input) => {
    const bootstrapping = adminUserCount(get().staff) === 0;
    if (!bootstrapping) {
      const denied = assertCan(currentRole(), "manage_users");
      if (!denied.ok) return denied;
    }

    const error = validateInput(input, get().staff);
    if (error) return { ok: false, error };

    const restaurantId = get().restaurantId ?? DEMO_RESTAURANT_ID;
    const id = newStaffId();
    const staff: StaffUser = {
      id,
      restaurantId,
      name: input.name.trim(),
      mobile: input.mobile.trim(),
      email: normalizeEmail(input.email),
      avatarDataUrl: input.avatarDataUrl?.trim() || null,
      avatarEmoji:
        input.avatarEmoji?.trim() || staffAvatarEmoji(id),
      role: input.role,
      branchId: input.branchId,
      password: input.password.trim(),
      archived: false,
      createdAt: new Date().toISOString(),
    };
    const next = [staff, ...get().staff];
    set({ staff: next, hydrated: true });
    persist(next);
    return { ok: true, staff };
  },

  updateStaff: (id, input) => {
    const denied = assertCan(currentRole(), "manage_users");
    if (!denied.ok) return denied;

    const existing = get().staff.find((row) => row.id === id && !row.archived);
    if (!existing) return { ok: false, error: "User not found." };

    const merged: StaffInput = {
      name: input.name ?? existing.name,
      mobile: input.mobile ?? existing.mobile,
      email: input.email ?? existing.email,
      role: input.role ?? existing.role,
      branchId: input.branchId ?? existing.branchId,
      password: input.password ?? existing.password,
      avatarDataUrl:
        input.avatarDataUrl === undefined
          ? existing.avatarDataUrl
          : input.avatarDataUrl,
      avatarEmoji:
        input.avatarEmoji === undefined
          ? existing.avatarEmoji
          : input.avatarEmoji,
    };
    const error = validateInput(merged, get().staff, id);
    if (error) return { ok: false, error };

    if (
      can(existing.role, "manage_users") &&
      !can(merged.role, "manage_users") &&
      adminUserCount(get().staff, id) < 1
    ) {
      return {
        ok: false,
        error: "Keep at least one user who can manage users.",
      };
    }

    const next = get().staff.map((row) =>
      row.id === id
        ? {
          ...row,
          name: merged.name.trim(),
          mobile: merged.mobile.trim(),
          email: normalizeEmail(merged.email),
          avatarDataUrl: merged.avatarDataUrl?.trim() || null,
          avatarEmoji:
            merged.avatarEmoji?.trim() ||
            resolveStaffAvatarEmoji(id, existing.avatarEmoji),
          role: merged.role,
          branchId: merged.branchId,
          password: merged.password.trim(),
        }
        : row,
    );
    set({ staff: next, hydrated: true });
    persist(next);

    void import("@/store/auth-store").then(({ useAuthStore }) => {
      if (useAuthStore.getState().user?.id === id) {
        useAuthStore.getState().refreshAssignedBranch();
      }
    });

    return { ok: true };
  },

  archiveStaff: (id) => {
    const denied = assertCan(currentRole(), "manage_users");
    if (!denied.ok) return denied;

    const target = get().staff.find((row) => row.id === id && !row.archived);
    if (!target) return { ok: false, error: "User not found." };
    if (
      can(target.role, "manage_users") &&
      adminUserCount(get().staff, id) < 1
    ) {
      return { ok: false, error: "Keep at least one user who can manage users." };
    }

    const next = get().staff.map((row) =>
      row.id === id ? { ...row, archived: true } : row,
    );
    set({ staff: next, hydrated: true });
    persist(next);
    return { ok: true };
  },

  ensureAdminAssignee: () => {
    const active = get().staff.filter((row) => !row.archived);
    if (active.some((row) => can(row.role, "manage_users"))) return;

    const restaurantId =
      get().restaurantId ?? active[0]?.restaurantId ?? DEMO_RESTAURANT_ID;
    const candidate =
      active.find((row) => roleKeyFromId(row.role) === "manager") ??
      active[0];
    if (!candidate) return;

    const adminRole = roleIdForRestaurant(restaurantId, "admin");
    const next = get().staff.map((row) =>
      row.id === candidate.id ? { ...row, role: adminRole } : row,
    );
    set({ staff: next, hydrated: true });
    persist(next);

    void import("@/store/auth-store").then(({ useAuthStore }) => {
      if (useAuthStore.getState().user?.id === candidate.id) {
        useAuthStore.getState().refreshAssignedBranch();
      }
    });
  },
}));
