"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ImagePlus,
  MapPin,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Store,
  Sun,
  Trash2,
  Shield,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  applyAppearance,
  readAppearance,
  type AppearanceMode,
} from "@/lib/appearance";
import {
  applyBrandColor,
  DEFAULT_BRAND_COLOR,
  normalizeBrandColor,
  pickThemeColorFromImageDataUrl,
} from "@/lib/brand-color";
import { nextBranchLabel } from "@/lib/branches";
import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY_CODE,
  normalizeCurrencyCode,
  type CurrencyCode,
} from "@/lib/currency";
import { nextTillLabel } from "@/lib/tills";
import { can } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth-store";
import { useOpsStore } from "@/store/ops-store";
import { useSettingsStore } from "@/store/settings-store";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { PosDialog } from "@/components/pos/PosDialog";
import { RolesSettingsPanel } from "@/components/settings/RolesSettingsPanel";
import { UsersSettingsPanel } from "@/components/settings/UsersSettingsPanel";

type SettingsSectionId =
  | "restaurant"
  | "branches"
  | "tax"
  | "appearance"
  | "roles"
  | "users";

const sections: {
  id: SettingsSectionId;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  {
    id: "restaurant",
    label: "Restaurant",
    hint: "Name, logo & color",
    icon: Store,
  },
  {
    id: "branches",
    label: "Branches",
    hint: "Locations & tills",
    icon: MapPin,
  },
  {
    id: "tax",
    label: "Tax & rates",
    hint: "Currency, VAT & demos",
    icon: Wallet,
  },
  {
    id: "appearance",
    label: "Appearance",
    hint: "Light / dark",
    icon: Palette,
  },
  {
    id: "roles",
    label: "Roles",
    hint: "Page access",
    icon: Shield,
  },
  {
    id: "users",
    label: "Users",
    hint: "People & branches",
    icon: UserRound,
  },
];

const appearanceOptions: {
  id: AppearanceMode;
  label: string;
  icon: typeof Sun;
}[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const MAX_LOGO_BYTES = 400_000;

const fieldClass =
  "mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm font-medium outline-none ring-[var(--pos-accent)] focus:ring-2 disabled:opacity-60";

const cellInputClass =
  "min-h-9 w-full min-w-[5.5rem] rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-slate-800 outline-none ring-[var(--pos-accent)] hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:ring-2 disabled:opacity-60";

const toggleClass =
  "flex min-h-11 items-center justify-between gap-3 rounded-md border border-slate-200 px-3 text-sm font-semibold";

const segmentBase =
  "min-h-11 rounded-md border text-sm font-semibold transition disabled:opacity-50";
const segmentOn =
  "border-[var(--pos-header)] bg-[var(--pos-header)] text-pos-on-header";
const segmentOff =
  "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

function PanelHeader({
  title,
  description,
  notice,
}: {
  title: string;
  description: string;
  notice?: string;
}) {
  return (
    <header className="border-b border-slate-100 pb-4">
      <div className="min-w-0">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {notice ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notice}
        </p>
      ) : null}
    </header>
  );
}

function parseSettingsSection(
  value: string | null,
): SettingsSectionId | null {
  if (!value) return null;
  return sections.some((item) => item.id === value)
    ? (value as SettingsSectionId)
    : null;
}

export function SettingsScreen() {
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const settings = useSettingsStore();
  const loadDemoSeed = useOpsStore((state) => state.loadDemoSeed);
  const clearDemoSeed = useOpsStore((state) => state.clearDemoSeed);
  const canEdit = can(user?.role, "edit_settings");
  const canManageUsers = can(user?.role, "manage_users");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const sectionFromUrl = parseSettingsSection(searchParams.get("section"));
  const [section, setSection] = useState<SettingsSectionId>(
    () => sectionFromUrl ?? "restaurant",
  );

  useEffect(() => {
    if (sectionFromUrl) setSection(sectionFromUrl);
  }, [sectionFromUrl]);

  const visibleSections = sections.filter((item) => {
    if (item.id === "roles" || item.id === "users") return canManageUsers;
    return true;
  });
  const activeSection: SettingsSectionId =
    !canManageUsers && (section === "roles" || section === "users")
      ? "restaurant"
      : section;
  const [restaurantName, setRestaurantName] = useState(
    settings.restaurantName,
  );
  const [restaurantLogoDataUrl, setRestaurantLogoDataUrl] = useState<
    string | null
  >(settings.restaurantLogoDataUrl);
  const [brandColor, setBrandColor] = useState(
    normalizeBrandColor(settings.brandColor),
  );
  /** Last non-default pick — restored when switching back to Custom. */
  const [lastCustomBrandColor, setLastCustomBrandColor] = useState(() => {
    const initial = normalizeBrandColor(settings.brandColor);
    return initial === DEFAULT_BRAND_COLOR ? "#ea580c" : initial;
  });
  const [logoError, setLogoError] = useState("");
  const [tillError, setTillError] = useState("");
  const [branchError, setBranchError] = useState("");
  const [draftTillNames, setDraftTillNames] = useState<Record<string, string>>(
    {},
  );
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [modalBranchName, setModalBranchName] = useState("");
  const [modalBranchPhone, setModalBranchPhone] = useState("");
  const [modalBranchAddress, setModalBranchAddress] = useState("");
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(
    normalizeCurrencyCode(settings.currencyCode),
  );
  const [taxPercent, setTaxPercent] = useState(settings.taxRate * 100);
  const [taxInclusive, setTaxInclusive] = useState(settings.taxInclusive);
  const [servicePercent, setServicePercent] = useState(
    settings.serviceRate * 100,
  );
  const [serviceDefault, setServiceDefault] = useState(settings.serviceDefault);
  const [kitchenSound, setKitchenSound] = useState(settings.kitchenSound);
  const [showDemoSeed, setShowDemoSeed] = useState(settings.showDemoSeed);
  const [appearance, setAppearance] = useState<AppearanceMode>(() =>
    readAppearance(),
  );
  const [saved, setSaved] = useState(false);

  const activeBranches = settings.branches.filter((branch) => !branch.archived);
  const assignedBranchId = user?.branchId ?? settings.activeBranchId;
  const isDefaultBrandColor =
    brandColor.toLowerCase() === DEFAULT_BRAND_COLOR;
  const customSwatchColor = isDefaultBrandColor
    ? lastCustomBrandColor
    : brandColor;

  // Keep draft fields aligned when IndexedDB / store hydration lands.
  useEffect(() => {
    let cancelled = false;
    const syncId = window.setTimeout(() => {
      if (cancelled) return;
      setRestaurantName(settings.restaurantName);
      setRestaurantLogoDataUrl(settings.restaurantLogoDataUrl);
      const nextColor = normalizeBrandColor(settings.brandColor);
      setBrandColor(nextColor);
      if (nextColor !== DEFAULT_BRAND_COLOR) {
        setLastCustomBrandColor(nextColor);
      }
      setCurrencyCode(normalizeCurrencyCode(settings.currencyCode));
      setTaxPercent(settings.taxRate * 100);
      setTaxInclusive(settings.taxInclusive);
      setServicePercent(settings.serviceRate * 100);
      setServiceDefault(settings.serviceDefault);
      setKitchenSound(settings.kitchenSound);
      setShowDemoSeed(settings.showDemoSeed);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(syncId);
    };
  }, [
    settings.restaurantName,
    settings.restaurantLogoDataUrl,
    settings.brandColor,
    settings.currencyCode,
    settings.taxRate,
    settings.taxInclusive,
    settings.serviceRate,
    settings.serviceDefault,
    settings.kitchenSound,
    settings.showDemoSeed,
  ]);

  function setAppearanceMode(mode: AppearanceMode) {
    setAppearance(mode);
    applyAppearance(mode);
  }

  function onLogoSelected(file: File | null) {
    setLogoError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be under 400 KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const result = typeof reader.result === "string" ? reader.result : null;
        if (!result) {
          setLogoError("Could not read that image.");
          return;
        }
        setRestaurantLogoDataUrl(result);

        const picked = await pickThemeColorFromImageDataUrl(result);
        if (picked && canEdit) {
          setBrandColor(picked);
          setLastCustomBrandColor(picked);
          applyBrandColor(picked);
          settings.save({
            restaurantLogoDataUrl: result,
            brandColor: picked,
          });
          return;
        }

        if (canEdit) {
          settings.save({ restaurantLogoDataUrl: result });
        }
      })();
    };
    reader.onerror = () => setLogoError("Could not read that image.");
    reader.readAsDataURL(file);
  }

  /** Persist theme color immediately — per-restaurant, in till_settings. */
  function saveBrandColor(next: string) {
    const color = normalizeBrandColor(next);
    setBrandColor(color);
    if (color !== DEFAULT_BRAND_COLOR) {
      setLastCustomBrandColor(color);
    }
    applyBrandColor(color);
    if (!canEdit) return;
    settings.save({ brandColor: color });
  }

  function openCustomThemePicker() {
    if (!canEdit) return;
    // Apply the custom swatch first, then open the native picker to tweak it.
    saveBrandColor(customSwatchColor);
    requestAnimationFrame(() => {
      colorInputRef.current?.click();
    });
  }

  function save() {
    if (!canEdit) return;

    if (activeSection === "restaurant") {
      settings.save({
        restaurantName: restaurantName.trim(),
        restaurantLogoDataUrl,
        brandColor: normalizeBrandColor(brandColor),
      });
    } else if (activeSection === "tax") {
      settings.save({
        currencyCode: normalizeCurrencyCode(currencyCode),
        taxRate: Math.max(0, taxPercent) / 100,
        taxInclusive,
        serviceRate: Math.max(0, servicePercent) / 100,
        serviceDefault,
        kitchenSound,
        showDemoSeed,
      });
      if (showDemoSeed) {
        loadDemoSeed();
      } else {
        clearDemoSeed();
      }
    }

    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  function openBranchEditor(branchId: string) {
    const branch = settings.branches.find((item) => item.id === branchId);
    if (!branch) return;
    setBranchError("");
    setTillError("");
    setEditingBranchId(branch.id);
    setModalBranchName(branch.name);
    setModalBranchPhone(branch.phone);
    setModalBranchAddress(branch.address);
  }

  function closeBranchEditor() {
    if (editingBranchId && canEdit) {
      commitModalBranchField("name", modalBranchName);
      commitModalBranchField("phone", modalBranchPhone);
      commitModalBranchField("address", modalBranchAddress);
    }
    setEditingBranchId(null);
    setBranchError("");
    setTillError("");
  }

  function addTill(branchId: string) {
    if (!canEdit) return;
    setTillError("");
    const result = settings.addTill(
      nextTillLabel(settings.tills, branchId),
      branchId,
    );
    if (!result.ok) setTillError(result.error);
  }

  function addBranch() {
    if (!canEdit) return;
    setBranchError("");
    const result = settings.addBranch({
      name: nextBranchLabel(settings.branches),
    });
    if (!result.ok) {
      setBranchError(result.error);
      return;
    }
    openBranchEditor(result.branch.id);
  }

  function commitModalBranchField(
    field: "name" | "phone" | "address",
    value: string,
  ) {
    if (!canEdit || !editingBranchId) return;
    const branch = settings.branches.find(
      (item) => item.id === editingBranchId,
    );
    if (!branch) return;
    const next = value.trim();
    if (field === "name") {
      if (!next || next === branch.name) {
        setModalBranchName(branch.name);
        return;
      }
      setBranchError("");
      const result = settings.updateBranch(branch.id, { name: next });
      if (!result.ok) {
        setBranchError(result.error);
        setModalBranchName(branch.name);
        return;
      }
      setModalBranchName(next);
      return;
    }
    if (field === "phone") {
      if (next === branch.phone.trim()) {
        setModalBranchPhone(branch.phone);
        return;
      }
      setBranchError("");
      const result = settings.updateBranch(branch.id, { phone: next });
      if (!result.ok) {
        setBranchError(result.error);
        setModalBranchPhone(branch.phone);
        return;
      }
      setModalBranchPhone(next);
      return;
    }
    if (next === branch.address.trim()) {
      setModalBranchAddress(branch.address);
      return;
    }
    setBranchError("");
    const result = settings.updateBranch(branch.id, { address: next });
    if (!result.ok) {
      setBranchError(result.error);
      setModalBranchAddress(branch.address);
      return;
    }
    setModalBranchAddress(next);
  }

  const editingBranch = editingBranchId
    ? settings.branches.find((branch) => branch.id === editingBranchId)
    : undefined;
  const editingBranchTills = editingBranchId
    ? settings.getBranchTills(editingBranchId)
    : [];

  const managerNotice = canEdit
    ? undefined
    : "Only managers can change these settings.";

  const showSave =
    canEdit && (activeSection === "restaurant" || activeSection === "tax");

  return (
    <ModuleShell
      title="Settings"
      secondaryBar={
        <nav
          aria-label="Settings sections"
          className="mx-auto w-full max-w-6xl px-3 sm:px-4"
        >
          <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleSections.map((item) => {
              const Icon = item.icon;
              const selected = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.hint}
                  onClick={() => setSection(item.id)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                    selected
                      ? "bg-[var(--pos-header)] text-pos-on-header"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      selected ? "text-pos-on-header" : "text-slate-500"
                    }`}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      }
    >
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
          {activeSection === "restaurant" ? (
            <div className="space-y-5">
              <PanelHeader
                title="Restaurant brand"
                description="Name, logo, and color apply to every branch. Locations keep their own phone and address under Branches."
                notice={managerNotice}
              />
              <div className="mx-auto flex max-w-xl flex-col gap-5 sm:flex-row sm:items-start">
                <div className="flex w-full flex-col items-center gap-2 sm:w-40">
                  <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50">
                    {restaurantLogoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- settings preview of local data URL
                      <img
                        src={restaurantLogoDataUrl}
                        alt={`${restaurantName || "Brand"} logo`}
                        className="max-h-full max-w-full object-contain p-2"
                      />
                    ) : (
                      <span className="px-3 text-center text-xs text-slate-400">
                        Brand logo
                      </span>
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={!canEdit}
                    onChange={(event) =>
                      onLogoSelected(event.target.files?.[0] ?? null)
                    }
                  />
                  <div className="grid w-full grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => logoInputRef.current?.click()}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Upload
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit || !restaurantLogoDataUrl}
                      onClick={() => {
                        setRestaurantLogoDataUrl(null);
                        if (logoInputRef.current) logoInputRef.current.value = "";
                      }}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                  {logoError ? (
                    <p className="text-xs text-rose-600">{logoError}</p>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <label className="block text-sm font-semibold text-slate-700">
                    Brand name
                    <input
                      value={restaurantName}
                      disabled={!canEdit}
                      onChange={(event) => setRestaurantName(event.target.value)}
                      placeholder="e.g. Arax"
                      className={fieldClass}
                    />
                  </label>

                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      Theme color
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Picked from your logo when you upload — change anytime.
                    </p>
                    <input
                      ref={colorInputRef}
                      type="color"
                      value={customSwatchColor}
                      disabled={!canEdit}
                      onChange={(event) => {
                        saveBrandColor(event.target.value);
                      }}
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                    />
                    <div className="mt-3 flex items-start gap-5">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => saveBrandColor(DEFAULT_BRAND_COLOR)}
                        className="flex flex-col items-center gap-1.5 disabled:opacity-50"
                        aria-pressed={isDefaultBrandColor}
                      >
                        <span
                          className={`h-9 w-9 rounded-full ${
                            isDefaultBrandColor
                              ? "outline outline-2 outline-offset-2 outline-[var(--pos-header)]"
                              : "ring-1 ring-slate-200"
                          }`}
                          style={{ backgroundColor: DEFAULT_BRAND_COLOR }}
                        />
                        <span
                          className={`text-xs ${
                            isDefaultBrandColor
                              ? "font-semibold text-slate-900"
                              : "text-slate-500"
                          }`}
                        >
                          Default
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={openCustomThemePicker}
                        className="flex flex-col items-center gap-1.5 disabled:opacity-50"
                        aria-pressed={!isDefaultBrandColor}
                      >
                        <span
                          className={`h-9 w-9 rounded-full ${
                            isDefaultBrandColor ? "ring-1 ring-slate-200" : ""
                          }`}
                          style={{
                            backgroundColor: customSwatchColor,
                            outline: isDefaultBrandColor
                              ? undefined
                              : `2px solid ${customSwatchColor}`,
                            outlineOffset: isDefaultBrandColor
                              ? undefined
                              : "2px",
                          }}
                        />
                        <span
                          className={`text-xs ${
                            isDefaultBrandColor
                              ? "text-slate-500"
                              : "font-semibold text-slate-900"
                          }`}
                        >
                          Custom
                        </span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    Receipts show this logo and brand · branch (e.g. Arax ·
                    Dhanmondi), with each branch&apos;s own phone and address.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "branches" ? (
            <div className="space-y-5">
              <PanelHeader
                title="Branches & tills"
                description="Edit a branch to set phone, address, and tills. Staff switch tills on the POS — no permission needed."
                notice={managerNotice}
              />

              {branchError && !editingBranchId ? (
                <p className="text-sm text-rose-700">{branchError}</p>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Locations ({activeBranches.length})
                  </p>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={addBranch}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--pos-header)] px-3 text-sm font-semibold text-pos-on-header hover:brightness-110"
                    >
                      <Plus className="h-4 w-4" />
                      Add branch
                    </button>
                  ) : null}
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        {["Branch", "Phone", "Address", "Tills", ""].map(
                          (heading) => (
                            <th
                              key={heading || "actions"}
                              scope="col"
                              className={`px-2 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 ${
                                heading === "" ? "w-24" : ""
                              }`}
                            >
                              {heading || (
                                <span className="sr-only">Actions</span>
                              )}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {activeBranches.map((branch) => {
                        const tillCount = settings.getBranchTills(branch.id)
                          .length;
                        const isYours = branch.id === assignedBranchId;
                        return (
                          <tr
                            key={branch.id}
                            className="border-t border-slate-100"
                          >
                            <td className="px-3 py-2.5 font-medium text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span>{branch.name}</span>
                                {isYours ? (
                                  <span className="shrink-0 text-[10px] font-bold uppercase text-[var(--pos-header)]">
                                    You
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {branch.phone.trim() || "—"}
                            </td>
                            <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-600">
                              {branch.address.trim() || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500">
                              {tillCount}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openBranchEditor(branch.id)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                                  aria-label={`Edit ${branch.name}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !canEdit || activeBranches.length <= 1
                                  }
                                  onClick={() => {
                                    setBranchError("");
                                    const result = settings.archiveBranch(
                                      branch.id,
                                    );
                                    if (!result.ok) {
                                      setBranchError(result.error);
                                      return;
                                    }
                                    if (editingBranchId === branch.id) {
                                      closeBranchEditor();
                                    }
                                  }}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                                  aria-label={`Remove ${branch.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <PosDialog
                open={Boolean(editingBranch)}
                title={
                  editingBranch
                    ? `Edit ${editingBranch.name}`
                    : "Edit branch"
                }
                onClose={closeBranchEditor}
                footer={
                  <button
                    type="button"
                    onClick={closeBranchEditor}
                    className="min-h-11 w-full rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header"
                  >
                    Done
                  </button>
                }
              >
                {editingBranch ? (
                  <div className="space-y-4">
                    {branchError || tillError ? (
                      <p className="text-sm text-rose-700">
                        {branchError || tillError}
                      </p>
                    ) : null}

                    <label className="block text-sm font-semibold text-slate-700">
                      Branch name
                      <input
                        value={modalBranchName}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setModalBranchName(event.target.value)
                        }
                        onBlur={() =>
                          commitModalBranchField("name", modalBranchName)
                        }
                        className={fieldClass}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                      Phone
                      <input
                        value={modalBranchPhone}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setModalBranchPhone(event.target.value)
                        }
                        onBlur={() =>
                          commitModalBranchField("phone", modalBranchPhone)
                        }
                        placeholder="Phone"
                        className={fieldClass}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                      Address
                      <input
                        value={modalBranchAddress}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setModalBranchAddress(event.target.value)
                        }
                        onBlur={() =>
                          commitModalBranchField(
                            "address",
                            modalBranchAddress,
                          )
                        }
                        placeholder="Address"
                        className={fieldClass}
                      />
                    </label>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Tills ({editingBranchTills.length})
                        </p>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => addTill(editingBranch.id)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Plus className="h-4 w-4" />
                            Add till
                          </button>
                        ) : null}
                      </div>
                      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                        {editingBranchTills.map((till) => (
                          <li
                            key={till.id}
                            className="flex items-center gap-2 px-1 py-1"
                          >
                            <input
                              value={draftTillNames[till.id] ?? till.name}
                              disabled={!canEdit}
                              onChange={(event) =>
                                setDraftTillNames((prev) => ({
                                  ...prev,
                                  [till.id]: event.target.value,
                                }))
                              }
                              onBlur={() => {
                                const next = (
                                  draftTillNames[till.id] ?? till.name
                                ).trim();
                                setDraftTillNames((prev) => {
                                  const copy = { ...prev };
                                  delete copy[till.id];
                                  return copy;
                                });
                                if (!next || next === till.name) return;
                                setTillError("");
                                const result = settings.renameTill(
                                  till.id,
                                  next,
                                );
                                if (!result.ok) setTillError(result.error);
                              }}
                              className={cellInputClass}
                              aria-label="Till name"
                            />
                            <button
                              type="button"
                              disabled={
                                !canEdit || editingBranchTills.length <= 1
                              }
                              onClick={() => {
                                setTillError("");
                                const result = settings.archiveTill(till.id);
                                if (!result.ok) setTillError(result.error);
                              }}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                              aria-label={`Remove ${till.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </PosDialog>
            </div>
          ) : null}

          {activeSection === "tax" ? (
            <div className="space-y-5">
              <PanelHeader
                title="Tax & rates"
                description="Currency and bill rates for this restaurant. Amounts stay stored as numbers."
                notice={managerNotice}
              />
              <div className="mx-auto max-w-xl space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                  Currency
                  <select
                    disabled={!canEdit}
                    value={currencyCode}
                    onChange={(event) =>
                      setCurrencyCode(
                        normalizeCurrencyCode(event.target.value) ||
                          DEFAULT_CURRENCY_CODE,
                      )
                    }
                    className={fieldClass}
                  >
                    {CURRENCY_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1.5 block text-xs font-normal text-slate-500">
                    Changes how money is shown. Prices and totals stay plain
                    numbers in the database.
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-semibold text-slate-700">
                    Tax %
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      disabled={!canEdit}
                      value={taxPercent}
                      onChange={(event) =>
                        setTaxPercent(Number(event.target.value) || 0)
                      }
                      className={fieldClass}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Service %
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      disabled={!canEdit}
                      value={servicePercent}
                      onChange={(event) =>
                        setServicePercent(Number(event.target.value) || 0)
                      }
                      className={fieldClass}
                    />
                  </label>
                </div>

                <fieldset>
                  <legend className="text-sm font-semibold text-slate-700">
                    VAT mode
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setTaxInclusive(true)}
                      aria-pressed={taxInclusive}
                      className={`${segmentBase} ${
                        taxInclusive ? segmentOn : segmentOff
                      }`}
                    >
                      Inclusive
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setTaxInclusive(false)}
                      aria-pressed={!taxInclusive}
                      className={`${segmentBase} ${
                        !taxInclusive ? segmentOn : segmentOff
                      }`}
                    >
                      Exclusive
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {taxInclusive
                      ? "Menu prices already include VAT — receipt shows the embedded amount."
                      : "Menu prices are ex-VAT — tax is added on top of the bill."}
                  </p>
                </fieldset>

                <label className={toggleClass}>
                  Service charge on by default
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={serviceDefault}
                    onChange={(event) =>
                      setServiceDefault(event.target.checked)
                    }
                    className="h-4 w-4"
                  />
                </label>
                <label className={toggleClass}>
                  Kitchen bump sound
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={kitchenSound}
                    onChange={(event) => setKitchenSound(event.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
                <label className={toggleClass}>
                  Show demo seed data
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={showDemoSeed}
                    onChange={(event) => setShowDemoSeed(event.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Sample orders, kitchen tickets, and floor tables for demos.
                  Turn off to keep only live till orders.
                </p>
              </div>
            </div>
          ) : null}

          {activeSection === "appearance" ? (
            <div className="space-y-5">
              <PanelHeader
                title="Appearance"
                description="Flips page surfaces and text. Brand and status colors stay the same."
              />
              <div
                className="mx-auto grid max-w-lg grid-cols-3 gap-2"
                role="group"
                aria-label="Appearance mode"
              >
                {appearanceOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = appearance === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setAppearanceMode(option.id)}
                      aria-pressed={selected}
                      className={`flex min-h-20 flex-col items-center justify-center gap-2 ${segmentBase} ${
                        selected ? segmentOn : segmentOff
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeSection === "roles" && canManageUsers ? (
            <RolesSettingsPanel />
          ) : null}

          {activeSection === "users" && canManageUsers ? (
            <UsersSettingsPanel />
          ) : null}

          {showSave ? (
            <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={save}
                className="min-h-11 rounded-md bg-[var(--pos-header)] px-6 text-sm font-semibold text-pos-on-header hover:brightness-110"
              >
                {saved ? "Settings saved" : "Save changes"}
              </button>
            </div>
          ) : null}
      </div>
    </ModuleShell>
  );
}
