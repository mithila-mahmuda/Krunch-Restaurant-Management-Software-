"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Plus, Trash2 } from "lucide-react";
import { ALL_BRANCHES_ID } from "@/lib/branch-access";
import { can } from "@/lib/permissions";
import type { StaffUser } from "@/lib/staff";
import { staffAvatarEmoji } from "@/lib/staff-avatar";
import { Select } from "@/components/Select";
import { UserAvatar } from "@/components/settings/UserAvatar";
import { useAuthStore } from "@/store/auth-store";
import { useRolesStore } from "@/store/roles-store";
import { useSettingsStore } from "@/store/settings-store";
import { useStaffStore, type StaffInput } from "@/store/staff-store";

const cellInputClass =
  "min-h-9 w-full min-w-[5.5rem] rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-slate-800 outline-none ring-[var(--pos-accent)] hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:ring-2 disabled:opacity-60";

type NewUserDraft = StaffInput;

function emptyDraft(branchId: string, roleId: string): NewUserDraft {
  return {
    name: "",
    mobile: "",
    email: "",
    role: roleId,
    branchId,
    password: "",
    avatarDataUrl: null,
    avatarEmoji: staffAvatarEmoji(`draft-${Date.now()}`),
  };
}

export function UsersSettingsPanel({
  notice,
}: {
  notice?: string;
}) {
  const user = useAuthStore((state) => state.user);
  const branches = useSettingsStore((state) => state.branches);
  const staff = useStaffStore((state) => state.staff);
  const createStaff = useStaffStore((state) => state.createStaff);
  const updateStaff = useStaffStore((state) => state.updateStaff);
  const archiveStaff = useStaffStore((state) => state.archiveStaff);
  const roles = useRolesStore((state) => state.roles);
  const activeRoles = roles.filter((role) => !role.archived);

  const canManage = can(user?.role, "manage_users");
  const activeBranches = branches.filter((branch) => !branch.archived);
  const activeStaff = staff.filter((row) => !row.archived);
  const defaultBranchId =
    user?.branchId ?? activeBranches[0]?.id ?? "";
  const defaultRoleId =
    activeRoles.find((role) => role.id.endsWith(":cashier"))?.id ??
    activeRoles.find((role) => !role.id.endsWith(":admin"))?.id ??
    activeRoles[0]?.id ??
    "cashier";

  const [error, setError] = useState("");
  const [draft, setDraft] = useState<NewUserDraft | null>(null);

  function patchUser(id: string, patch: Partial<StaffInput>) {
    if (!canManage) return;
    setError("");
    const result = updateStaff(id, patch);
    if (!result.ok) setError(result.error);
  }

  function removeStaff(id: string) {
    if (!canManage) return;
    setError("");
    const result = archiveStaff(id);
    if (!result.ok) setError(result.error);
  }

  function openCreate() {
    setError("");
    setDraft(emptyDraft(defaultBranchId, defaultRoleId));
  }

  function saveNewUser() {
    if (!draft || !canManage) return;
    setError("");
    const result = createStaff(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(null);
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-slate-100 pb-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
          Users
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Role and branch apply immediately. Open a profile to edit other
          details.
        </p>
        {notice ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {notice}
          </p>
        ) : null}
      </header>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Team ({activeStaff.length})
        </p>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            disabled={draft != null}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--pos-header)] px-3 text-sm font-semibold text-pos-on-header hover:brightness-110 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add user
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              {(
                [
                  "Name",
                  "Mobile",
                  "Email",
                  "Role",
                  "Branch",
                  "Password",
                  "",
                ] as const
              ).map((heading) => (
                <th
                  key={heading || "actions"}
                  scope="col"
                  className={`px-2 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 ${
                    heading === "" ? "w-24" : ""
                  }`}
                >
                  {heading || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeStaff.length === 0 && !draft ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  No users yet. Add a person and assign their role and branch.
                </td>
              </tr>
            ) : null}

            {activeStaff.map((row) => (
              <UserRow
                key={row.id}
                row={row}
                isYou={row.id === user?.id}
                canManage={canManage}
                activeRoles={activeRoles}
                activeBranches={activeBranches}
                onPatch={patchUser}
                onRemove={removeStaff}
              />
            ))}

            {draft ? (
              <tr className="border-t border-slate-100 bg-[var(--pos-accent-soft)]/40">
                <td className="px-1 py-1.5">
                  <div className="flex min-w-[10rem] items-center gap-2">
                    <UserAvatar
                      name={draft.name}
                      seed="new-user"
                      avatarDataUrl={draft.avatarDataUrl}
                      avatarEmoji={draft.avatarEmoji}
                      canEdit
                      onChange={(avatarDataUrl) =>
                        setDraft({ ...draft, avatarDataUrl })
                      }
                      onError={setError}
                    />
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                      placeholder="Name"
                      className={cellInputClass}
                      autoFocus
                    />
                  </div>
                </td>
                <td className="px-1 py-1.5">
                  <input
                    value={draft.mobile}
                    onChange={(event) =>
                      setDraft({ ...draft, mobile: event.target.value })
                    }
                    placeholder="Mobile"
                    inputMode="tel"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <input
                    value={draft.email}
                    onChange={(event) =>
                      setDraft({ ...draft, email: event.target.value })
                    }
                    placeholder="Email"
                    type="email"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <Select
                    compact
                    aria-label="Role for new user"
                    value={draft.role}
                    onChange={(role) => setDraft({ ...draft, role })}
                    options={activeRoles.map((role) => ({
                      value: role.id,
                      label: role.name,
                    }))}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <Select
                    compact
                    aria-label="Branch for new user"
                    value={draft.branchId}
                    onChange={(branchId) => setDraft({ ...draft, branchId })}
                    options={[
                      { value: ALL_BRANCHES_ID, label: "All branches" },
                      ...activeBranches.map((branch) => ({
                        value: branch.id,
                        label: branch.name,
                      })),
                    ]}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <input
                    value={draft.password}
                    onChange={(event) =>
                      setDraft({ ...draft, password: event.target.value })
                    }
                    placeholder="Password"
                    type="password"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={saveNewUser}
                      className="min-h-9 rounded-md bg-[var(--pos-header)] px-2.5 text-xs font-semibold text-pos-on-header hover:brightness-110"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="min-h-9 rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({
  row,
  isYou,
  canManage,
  activeRoles,
  activeBranches,
  onPatch,
  onRemove,
}: {
  row: StaffUser;
  isYou: boolean;
  canManage: boolean;
  activeRoles: { id: string; name: string }[];
  activeBranches: { id: string; name: string }[];
  onPatch: (id: string, patch: Partial<StaffInput>) => void;
  onRemove: (id: string) => void;
}) {
  const roleOptions =
    activeRoles.some((role) => role.id === row.role)
      ? activeRoles
      : [{ id: row.role, name: row.role }, ...activeRoles];

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2.5">
        <div className="flex min-w-[10rem] items-center gap-2">
          <UserAvatar
            name={row.name}
            seed={row.id}
            avatarDataUrl={row.avatarDataUrl}
            avatarEmoji={row.avatarEmoji}
          />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-slate-800">
              {row.name}
            </span>
            {isYou ? (
              <span className="shrink-0 rounded-md bg-[var(--pos-header)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-pos-on-header">
                You
              </span>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-slate-600">{row.mobile || "—"}</td>
      <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-600">
        {row.email || "—"}
      </td>
      <td className="px-1 py-1.5">
        <Select
          compact
          aria-label={`Role for ${row.name}`}
          value={row.role}
          disabled={!canManage}
          onChange={(role) => onPatch(row.id, { role })}
          options={roleOptions.map((role) => ({
            value: role.id,
            label: role.name,
          }))}
        />
      </td>
      <td className="px-1 py-1.5">
        <Select
          compact
          aria-label={`Branch for ${row.name}`}
          value={row.branchId}
          disabled={!canManage}
          onChange={(branchId) => onPatch(row.id, { branchId })}
          options={[
            { value: ALL_BRANCHES_ID, label: "All branches" },
            ...activeBranches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            })),
          ]}
        />
      </td>
      <td className="px-3 py-2.5 tracking-widest text-slate-500">••••••••</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center justify-end gap-1.5">
          <Link
            href={`/settings/users/${row.id}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label={`View ${row.name}`}
            title="View profile"
          >
            <Eye className="h-4 w-4" />
          </Link>
          {canManage ? (
            <button
              type="button"
              disabled={isYou}
              onClick={() => onRemove(row.id)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
              aria-label={`Remove ${row.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
