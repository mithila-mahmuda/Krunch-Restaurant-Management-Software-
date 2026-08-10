import { ALL_BRANCHES_ID } from "@/lib/branch-access";
import type { RoleId } from "@/lib/permissions";
import { SEED_BRANCH_IDS } from "@/lib/seed-locations";
import {
  DEMO_STAFF_EMOJIS,
  resolveStaffAvatarEmoji,
} from "@/lib/staff-avatar";
import { DEMO_RESTAURANT_ID } from "@/lib/tenant";

export { ALL_BRANCHES_ID };

/** Role id assigned to the user (built-in or custom). */
export type StaffRole = RoleId;

export interface StaffUser {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId: string;
  name: string;
  mobile: string;
  email: string;
  /** Optional profile photo (data URL). */
  avatarDataUrl?: string | null;
  /** Emoji avatar used when no photo is set. */
  avatarEmoji?: string | null;
  /** Role id — permissions come from the roles store. */
  role: StaffRole;
  /**
   * Admin-assigned branch — staff cannot self-select.
   * Use `ALL_BRANCHES_ID` (`*`) for access to every active branch.
   */
  branchId: string;
  password: string;
  archived: boolean;
  createdAt: string;
}

export function newStaffId(): string {
  return `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Seed users across branches.
 * Kyle + Maya share Dhanmondi so they can each pick Floor/Bar tills freely.
 */
export function createDemoStaff(_fallbackBranchId?: string): StaffUser[] {
  void _fallbackBranchId;
  const createdAt = new Date().toISOString();

  return [
    {
      id: "kyle",
      restaurantId: DEMO_RESTAURANT_ID,
      name: "Kyle",
      mobile: "01700000001",
      email: "kyle@krunch.app",
      avatarEmoji: DEMO_STAFF_EMOJIS.kyle,
      role: `${DEMO_RESTAURANT_ID}:admin`,
      branchId: ALL_BRANCHES_ID,
      password: "till1234",
      archived: false,
      createdAt,
    },
    {
      id: "maya",
      restaurantId: DEMO_RESTAURANT_ID,
      name: "Maya",
      mobile: "01700000002",
      email: "maya@krunch.app",
      avatarEmoji: DEMO_STAFF_EMOJIS.maya,
      role: `${DEMO_RESTAURANT_ID}:cashier`,
      branchId: SEED_BRANCH_IDS.dhanmondi,
      password: "till5678",
      archived: false,
      createdAt,
    },
    {
      id: "sam",
      restaurantId: DEMO_RESTAURANT_ID,
      name: "Sam",
      mobile: "01700000003",
      email: "sam@krunch.app",
      avatarEmoji: DEMO_STAFF_EMOJIS.sam,
      role: `${DEMO_RESTAURANT_ID}:server`,
      branchId: SEED_BRANCH_IDS.gulshan,
      password: "till9012",
      archived: false,
      createdAt,
    },
    {
      id: "riya",
      restaurantId: DEMO_RESTAURANT_ID,
      name: "Riya",
      mobile: "01700000004",
      email: "riya@krunch.app",
      avatarEmoji: DEMO_STAFF_EMOJIS.riya,
      role: `${DEMO_RESTAURANT_ID}:cashier`,
      branchId: SEED_BRANCH_IDS.gulshan,
      password: "till3456",
      archived: false,
      createdAt,
    },
    {
      id: "nadia",
      restaurantId: DEMO_RESTAURANT_ID,
      name: "Nadia",
      mobile: "01700000005",
      email: "nadia@krunch.app",
      avatarEmoji: DEMO_STAFF_EMOJIS.nadia,
      role: `${DEMO_RESTAURANT_ID}:manager`,
      branchId: SEED_BRANCH_IDS.banani,
      password: "till7890",
      archived: false,
      createdAt,
    },
  ];
}

/** Align classic demo accounts onto seed branches when those locations exist. */
export function assignDemoStaffBranches(
  staff: StaffUser[],
  branchIds: Set<string>,
): { staff: StaffUser[]; changed: boolean } {
  const targets: Record<string, string> = {
    kyle: ALL_BRANCHES_ID,
    maya: SEED_BRANCH_IDS.dhanmondi,
    sam: SEED_BRANCH_IDS.gulshan,
    riya: SEED_BRANCH_IDS.gulshan,
    nadia: SEED_BRANCH_IDS.banani,
  };

  let changed = false;
  const next = staff.map((row) => {
    let updated = row;
    if (!row.restaurantId) {
      changed = true;
      updated = { ...updated, restaurantId: DEMO_RESTAURANT_ID };
    }
    if (updated.role && !updated.role.includes(":")) {
      changed = true;
      updated = {
        ...updated,
        role: `${updated.restaurantId}:${updated.role}`,
      };
    }
    const emoji = resolveStaffAvatarEmoji(updated.id, updated.avatarEmoji);
    if (updated.avatarEmoji !== emoji) {
      changed = true;
      updated = { ...updated, avatarEmoji: emoji };
    }
    const target = targets[updated.id];
    if (!target || updated.branchId === target) return updated;
    if (target !== ALL_BRANCHES_ID && !branchIds.has(target)) return updated;
    changed = true;
    return { ...updated, branchId: target };
  });

  // Add missing demo cashiers if seed branches exist and roster is the old 3-person set.
  const ids = new Set(next.map((row) => row.id));
  if (branchIds.has(SEED_BRANCH_IDS.gulshan) && !ids.has("riya")) {
    const createdAt = new Date().toISOString();
    next.push({
      id: "riya",
      restaurantId: DEMO_RESTAURANT_ID,
      name: "Riya",
      mobile: "01700000004",
      email: "riya@krunch.app",
      avatarEmoji: DEMO_STAFF_EMOJIS.riya,
      role: `${DEMO_RESTAURANT_ID}:cashier`,
      branchId: SEED_BRANCH_IDS.gulshan,
      password: "till3456",
      archived: false,
      createdAt,
    });
    changed = true;
  }
  if (branchIds.has(SEED_BRANCH_IDS.banani) && !ids.has("nadia")) {
    const createdAt = new Date().toISOString();
    next.push({
      id: "nadia",
      restaurantId: DEMO_RESTAURANT_ID,
      name: "Nadia",
      mobile: "01700000005",
      email: "nadia@krunch.app",
      avatarEmoji: DEMO_STAFF_EMOJIS.nadia,
      role: `${DEMO_RESTAURANT_ID}:manager`,
      branchId: SEED_BRANCH_IDS.banani,
      password: "till7890",
      archived: false,
      createdAt,
    });
    changed = true;
  }

  return { staff: next, changed };
}
