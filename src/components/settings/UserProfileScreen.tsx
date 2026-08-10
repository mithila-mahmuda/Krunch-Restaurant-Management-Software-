"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { ALL_BRANCHES_ID, hasAllBranchAccess } from "@/lib/branch-access";
import { can } from "@/lib/permissions";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { UserAvatar } from "@/components/settings/UserAvatar";
import { useAuthStore } from "@/store/auth-store";
import { useRolesStore } from "@/store/roles-store";
import { useSettingsStore } from "@/store/settings-store";
import { useStaffStore } from "@/store/staff-store";

const fieldClass =
  "mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm font-medium outline-none ring-[var(--pos-accent)] focus:ring-2 disabled:opacity-60";

const USERS_SETTINGS_HREF = "/settings?section=users";

export function UserProfileScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = typeof params.id === "string" ? params.id : "";

  const sessionUser = useAuthStore((state) => state.user);
  const staff = useStaffStore((state) => state.staff);
  const hydrated = useStaffStore((state) => state.hydrated);
  const updateStaff = useStaffStore((state) => state.updateStaff);
  const branches = useSettingsStore((state) => state.branches);
  const roles = useRolesStore((state) => state.roles);
  const roleName = useRolesStore((state) => state.roleName);

  const canManage = can(sessionUser?.role, "manage_users");
  const profile = staff.find((row) => row.id === userId && !row.archived);
  const activeBranches = branches.filter((branch) => !branch.archived);
  const activeRoles = roles.filter((role) => !role.archived);
  const isYou = Boolean(sessionUser && sessionUser.id === userId);
  const canView = canManage || isYou;
  const backHref = canManage ? USERS_SETTINGS_HREF : "/pos";
  const backLabel = canManage ? "Back to users" : "Back to POS";

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [branchId, setBranchId] = useState("");
  const [password, setPassword] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setMobile(profile.mobile);
    setEmail(profile.email);
    setRole(profile.role);
    setBranchId(profile.branchId);
    setAvatarDataUrl(profile.avatarDataUrl ?? null);
    setPassword("");
    setError("");
    setEditing(false);
    setSaved(false);
  }, [profile]);

  function branchLabel(id: string) {
    if (hasAllBranchAccess(id)) return "All branches";
    return (
      activeBranches.find((branch) => branch.id === id)?.name ?? "Unassigned"
    );
  }

  function startEdit() {
    if (!profile || !canManage) return;
    setName(profile.name);
    setMobile(profile.mobile);
    setEmail(profile.email);
    setRole(profile.role);
    setBranchId(profile.branchId);
    setAvatarDataUrl(profile.avatarDataUrl ?? null);
    setPassword("");
    setError("");
    setSaved(false);
    setEditing(true);
  }

  function cancelEdit() {
    if (!profile) return;
    setName(profile.name);
    setMobile(profile.mobile);
    setEmail(profile.email);
    setRole(profile.role);
    setBranchId(profile.branchId);
    setAvatarDataUrl(profile.avatarDataUrl ?? null);
    setPassword("");
    setError("");
    setEditing(false);
  }

  function saveProfile() {
    if (!profile || !canManage) return;
    setError("");
    const result = updateStaff(profile.id, {
      name,
      mobile,
      email,
      role,
      branchId,
      password: password.trim() ? password : profile.password,
      avatarDataUrl,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPassword("");
    setEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  useEffect(() => {
    if (!hydrated || !sessionUser) return;
    if (!canView) {
      router.replace("/pos");
    }
  }, [hydrated, sessionUser, canView, router]);

  if (!hydrated) {
    return (
      <ModuleShell title="User profile" backHref={backHref} backLabel={backLabel}>
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading profile…
        </div>
      </ModuleShell>
    );
  }

  if (!canView) {
    return (
      <ModuleShell title="User profile" backHref="/pos" backLabel="Back to POS">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Redirecting…
        </div>
      </ModuleShell>
    );
  }

  if (!profile) {
    return (
      <ModuleShell title="User profile" backHref={backHref} backLabel={backLabel}>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
            User not found
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            This person may have been removed, or the link is out of date.
          </p>
          <Link
            href={backHref}
            className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--pos-header)] px-4 text-sm font-semibold text-pos-on-header hover:brightness-110"
          >
            {backLabel}
          </Link>
        </div>
      </ModuleShell>
    );
  }

  const roleOptions = activeRoles.some((item) => item.id === profile.role)
    ? activeRoles
    : [{ id: profile.role, name: roleName(profile.role) }, ...activeRoles];

  return (
    <ModuleShell
      title={profile.name}
      backHref={backHref}
      backLabel={backLabel}
    >
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <UserAvatar
              name={editing ? name : profile.name}
              seed={profile.id}
              avatarDataUrl={editing ? avatarDataUrl : profile.avatarDataUrl}
              avatarEmoji={profile.avatarEmoji}
              canEdit={canManage}
              size="lg"
              onChange={(next) => {
                setError("");
                setAvatarDataUrl(next);
                if (editing) return;
                const result = updateStaff(profile.id, {
                  avatarDataUrl: next,
                });
                if (!result.ok) setError(result.error);
              }}
              onError={setError}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
                  {editing ? name || "Unnamed" : profile.name}
                </h2>
                {isYou ? (
                  <span className="rounded-md bg-[var(--pos-header)] px-2 py-0.5 text-[10px] font-bold uppercase text-pos-on-header">
                    You
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {editing ? roleName(role) : roleName(profile.role)}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {editing
                    ? branchLabel(branchId)
                    : branchLabel(profile.branchId)}
                </span>
              </div>
            </div>
          </div>

          {canManage && !editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:px-4"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
        {saved ? (
          <p className="mt-4 text-sm font-medium text-emerald-700">
            Profile saved
          </p>
        ) : null}

        {editing ? (
          <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Mobile
                <input
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  inputMode="tel"
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                Email
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className={fieldClass}
                >
                  {roleOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Branch
                <select
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                  className={fieldClass}
                >
                  <option value={ALL_BRANCHES_ID}>All branches</option>
                  {activeBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                New password
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                  className={fieldClass}
                />
              </label>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={cancelEdit}
                className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfile}
                className="min-h-11 rounded-md bg-[var(--pos-header)] px-5 text-sm font-semibold text-pos-on-header hover:brightness-110"
              >
                Save changes
              </button>
            </div>
          </div>
        ) : (
          <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Mobile
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                {profile.mobile || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Email
              </dt>
              <dd className="mt-1 break-all text-sm font-medium text-slate-800">
                {profile.email || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Role
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                {roleName(profile.role)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Branch
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                {branchLabel(profile.branchId)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Password
              </dt>
              <dd className="mt-1 text-sm font-medium tracking-widest text-slate-800">
                ••••••••
              </dd>
            </div>
          </dl>
        )}

        {!canManage ? (
          <p className="mt-5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Only managers can edit user profiles.
          </p>
        ) : null}

        <div className="mt-6 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900 hover:underline"
          >
            ← {backLabel}
          </button>
        </div>
      </div>
    </ModuleShell>
  );
}
