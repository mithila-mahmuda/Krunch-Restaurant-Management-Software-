"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ClipboardList,
  FileText,
  Paperclip,
  Plus,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { Select, type SelectOption } from "@/components/Select";
import { PosDialog } from "@/components/pos/PosDialog";
import { SuppliersPanel } from "@/components/purchases/SuppliersPanel";
import {
  accessibleBranches,
  hasAllBranchAccess,
} from "@/lib/branch-access";
import { formatMoney } from "@/lib/format";
import type { PurchaseAttachment } from "@/lib/purchases";
import { can } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth-store";
import { usePurchaseStore } from "@/store/purchase-store";
import { useSettingsStore } from "@/store/settings-store";

type PurchaseSectionId = "entry" | "suppliers";

const sections: {
  id: PurchaseSectionId;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
    {
      id: "entry",
      label: "Purchase entry",
      hint: "Stock-in from vendors",
      icon: ClipboardList,
    },
    {
      id: "suppliers",
      label: "Suppliers",
      hint: "Vendor list",
      icon: Truck,
    },
  ];

function parsePurchaseSection(value: string | null): PurchaseSectionId | null {
  return value === "entry" || value === "suppliers" ? value : null;
}

const UNIT_OPTIONS: SelectOption[] = [
  { value: "pcs", label: "p" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "L", label: "L" },
  { value: "ml", label: "ml" },
  { value: "boxes", label: "box" },
  { value: "bottles", label: "btl" },
  { value: "cans", label: "can" },
  { value: "bags", label: "bag" },
  { value: "slices", label: "slc" },
  { value: "portions", label: "por" },
];

const MAX_ATTACHMENT_BYTES = 1_500_000;

type DraftLine = {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  rate: string;
  total: string;
};

type DraftPurchase = {
  key: string;
  branchId: string;
  supplierId: string;
  lines: DraftLine[];
  paidDraft: string;
  paidFollowsTotal: boolean;
  note: string;
  attachments: PurchaseAttachment[];
  error: string | null;
  /** When set, this entry was persisted and stays visible for review. */
  savedPurchaseId: string | null;
};

function newKey(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function newDraftLine(): DraftLine {
  return {
    key: newKey("line"),
    name: "",
    quantity: "1",
    unit: "pcs",
    rate: "",
    total: "",
  };
}

function newDraftPurchase(branchId: string, supplierId = ""): DraftPurchase {
  return {
    key: newKey("pur"),
    branchId,
    supplierId,
    lines: [newDraftLine()],
    paidDraft: "0",
    paidFollowsTotal: true,
    note: "",
    attachments: [],
    error: null,
    savedPurchaseId: null,
  };
}

function parseAmount(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatAmountField(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(roundMoney(value));
}

function totalFromRate(quantity: string, rate: string): string {
  if (!rate.trim()) return "";
  const qty = parseAmount(quantity);
  const unitRate = parseAmount(rate);
  if (!(qty > 0) || !(unitRate >= 0)) return "";
  return formatAmountField(qty * unitRate);
}

function rateFromTotal(quantity: string, total: string): string {
  if (!total.trim()) return "";
  const qty = parseAmount(quantity);
  const lineTotal = parseAmount(total);
  if (!(qty > 0) || !(lineTotal >= 0)) return "";
  return formatAmountField(lineTotal / qty);
}

function lineTotalValue(line: DraftLine): number {
  const total = parseAmount(line.total);
  if (total >= 0) return roundMoney(total);
  const qty = parseAmount(line.quantity);
  const rate = parseAmount(line.rate);
  if (!(qty > 0) || !(rate >= 0)) return 0;
  return roundMoney(qty * rate);
}

function isLineStarted(line: DraftLine): boolean {
  return Boolean(
    line.name.trim() ||
    line.rate.trim() ||
    line.total.trim() ||
    (line.quantity.trim() && line.quantity.trim() !== "1") ||
    (line.unit.trim() && line.unit.trim() !== "pcs"),
  );
}

function isLineComplete(line: DraftLine): boolean {
  const name = line.name.trim();
  const quantity = parseAmount(line.quantity);
  const rate = parseAmount(line.rate);
  const total = parseAmount(line.total);
  return (
    name.length > 0 &&
    Boolean(line.unit.trim()) &&
    quantity > 0 &&
    Number.isFinite(quantity) &&
    line.rate.trim().length > 0 &&
    rate >= 0 &&
    Number.isFinite(rate) &&
    line.total.trim().length > 0 &&
    total >= 0 &&
    Number.isFinite(total)
  );
}

function draftFingerprint(draft: DraftPurchase): string {
  return JSON.stringify({
    branchId: draft.branchId,
    supplierId: draft.supplierId,
    paidDraft: draft.paidDraft.trim(),
    note: draft.note.trim(),
    attachments: draft.attachments.map((file) => file.id),
    lines: draft.lines.map((line) => ({
      name: line.name.trim(),
      quantity: line.quantity.trim(),
      unit: line.unit.trim(),
      rate: line.rate.trim(),
      total: line.total.trim(),
    })),
  });
}

function hasDraftProgress(draft: DraftPurchase): boolean {
  return Boolean(
    draft.note.trim() ||
    draft.attachments.length > 0 ||
    draft.lines.some(isLineStarted),
  );
}

function isDraftDirty(draft: DraftPurchase): boolean {
  return (
    !draft.savedPurchaseId &&
    (Boolean(draft.supplierId) || hasDraftProgress(draft))
  );
}

function validateDraft(draft: DraftPurchase): string | null {
  if (!draft.branchId.trim()) {
    return "Choose a branch for this purchase.";
  }
  if (!draft.supplierId) {
    return "Select a supplier for this purchase.";
  }

  const startedLines = draft.lines.filter(isLineStarted);
  if (startedLines.length === 0) {
    return "Fill in at least one purchase item.";
  }

  for (let index = 0; index < draft.lines.length; index += 1) {
    const line = draft.lines[index]!;
    if (!isLineStarted(line)) continue;
    const label = line.name.trim() || `item ${index + 1}`;

    if (!isLineComplete(line)) {
      if (!line.name.trim()) {
        return `Enter a name for ${label}.`;
      }
      const quantity = parseAmount(line.quantity);
      if (!(quantity > 0) || !Number.isFinite(quantity)) {
        return `Enter a quantity greater than 0 for ${label}.`;
      }
      if (!line.unit.trim()) {
        return `Choose a unit for ${label}.`;
      }
      if (!line.rate.trim()) {
        return `Enter a rate for ${label}.`;
      }
      const rate = parseAmount(line.rate);
      if (!(rate >= 0) || !Number.isFinite(rate)) {
        return `Enter a valid rate for ${label}.`;
      }
      if (!line.total.trim()) {
        return `Enter a total for ${label}.`;
      }
      const total = parseAmount(line.total);
      if (!(total >= 0) || !Number.isFinite(total)) {
        return `Enter a valid total for ${label}.`;
      }
      return `Complete all fields on item ${index + 1} (name, qty, unit, rate, and total).`;
    }
  }

  const draftTotal = roundMoney(
    draft.lines.reduce((sum, line) => sum + lineTotalValue(line), 0),
  );
  const paid = draft.paidFollowsTotal
    ? draftTotal
    : parseAmount(draft.paidDraft);
  if (
    !(paid >= 0) ||
    !Number.isFinite(paid) ||
    (!draft.paidFollowsTotal && !draft.paidDraft.trim())
  ) {
    return "Enter a valid paid amount (0 or more).";
  }

  return null;
}

function applyLinePatch(line: DraftLine, patch: Partial<DraftLine>): DraftLine {
  const next = { ...line, ...patch };

  if (patch.rate !== undefined && patch.total === undefined) {
    next.total = totalFromRate(next.quantity, next.rate);
  } else if (patch.total !== undefined && patch.rate === undefined) {
    next.rate = rateFromTotal(next.quantity, next.total);
  } else if (patch.quantity !== undefined) {
    next.total = totalFromRate(next.quantity, next.rate);
  }

  return next;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function purchaseItemsSummary(
  lines: { name: string; quantity: number; unit: string }[],
): string {
  if (lines.length === 0) return "No items";
  const first = `${lines[0].quantity} ${lines[0].unit} ${lines[0].name}`;
  if (lines.length === 1) return first;
  return `${first} · +${lines.length - 1} more`;
}

function purchasePayStatus(paid: number, due: number, total: number): {
  label: string;
  className: string;
} {
  if (total <= 0 || due <= 0) {
    return {
      label: "Paid",
      className: "bg-emerald-100 text-emerald-800",
    };
  }
  if (paid <= 0) {
    return {
      label: `Due ${formatMoney(due)}`,
      className: "bg-rose-100 text-rose-800",
    };
  }
  return {
    label: `Due ${formatMoney(due)}`,
    className: "bg-amber-100 text-amber-900",
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function unitOptionsFor(currentUnit: string): SelectOption[] {
  const unit = currentUnit.trim();
  if (!unit || UNIT_OPTIONS.some((option) => option.value === unit)) {
    return UNIT_OPTIONS;
  }
  return [{ value: unit, label: unit }, ...UNIT_OPTIONS];
}

export function ItemPurchaseScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionFromUrl = parsePurchaseSection(searchParams.get("section"));
  const [section, setSection] = useState<PurchaseSectionId>(
    () => sectionFromUrl ?? "entry",
  );

  useEffect(() => {
    if (sectionFromUrl) setSection(sectionFromUrl);
  }, [sectionFromUrl]);

  const suppliers = usePurchaseStore((state) => state.suppliers);
  const purchases = usePurchaseStore((state) => state.purchases);
  const recordPurchase = usePurchaseStore((state) => state.recordPurchase);
  const branches = useSettingsStore((state) => state.branches);
  const activeBranchId = useSettingsStore((state) => state.activeBranchId);
  const role = useAuthStore((state) => state.user?.role);
  const assignedBranchId = useAuthStore((state) => state.user?.branchId);
  const canPurchase = can(role, "adjust_inventory");

  const accessible = useMemo(
    () => accessibleBranches(assignedBranchId, branches),
    [assignedBranchId, branches],
  );

  const branchOptions = useMemo(
    () =>
      accessible.map((branch) => ({
        value: branch.id,
        label: branch.name,
      })),
    [accessible],
  );

  const defaultBranchId =
    accessible.find((branch) => branch.id === activeBranchId)?.id ??
    accessible[0]?.id ??
    "";

  const [entryBranchId, setEntryBranchId] = useState(defaultBranchId);
  const [drafts, setDrafts] = useState<DraftPurchase[]>(() => [
    newDraftPurchase(defaultBranchId),
  ]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [noteDialogDraftKey, setNoteDialogDraftKey] = useState<string | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [attachDraftKey, setAttachDraftKey] = useState<string | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);

  const draftsRef = useRef(drafts);
  const lastSavedFingerprintRef = useRef<Map<string, string>>(new Map());
  const savingKeysRef = useRef<Set<string>>(new Set());
  const hasUnsavedRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const hasUnsavedChanges = useMemo(
    () => drafts.some(isDraftDirty),
    [drafts],
  );

  useEffect(() => {
    hasUnsavedRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!defaultBranchId) return;
    setEntryBranchId((current) => current || defaultBranchId);
    setDrafts((current) =>
      current.map((draft) =>
        draft.branchId || draft.savedPurchaseId
          ? draft
          : { ...draft, branchId: defaultBranchId },
      ),
    );
  }, [defaultBranchId]);

  const showBranchSwitcher =
    hasAllBranchAccess(assignedBranchId) && accessible.length > 1;
  const entryBranchName =
    accessible.find((branch) => branch.id === entryBranchId)?.name ??
    accessible[0]?.name ??
    "Branch";

  useEffect(() => {
    if (!branchMenuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!branchMenuRef.current?.contains(event.target as Node)) {
        setBranchMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setBranchMenuOpen(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [branchMenuOpen]);

  // Browser refresh / tab close
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // In-app link navigation (header back, nav drawer, etc.)
  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!hasUnsavedRef.current) return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setLeaveHref(`${url.pathname}${url.search}${url.hash}`);
    }

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, []);

  const supplierOptions = useMemo(
    () => [
      { value: "", label: "Select supplier…" },
      ...suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
      })),
    ],
    [suppliers],
  );

  const recentPurchases = useMemo(
    () =>
      [...purchases].sort(
        (a, b) => Date.parse(b.purchasedAt) - Date.parse(a.purchasedAt),
      ),
    [purchases],
  );

  const noteDialogDraft = noteDialogDraftKey
    ? (drafts.find((draft) => draft.key === noteDialogDraftKey) ?? null)
    : null;

  function updateDraft(
    draftKey: string,
    updater: (draft: DraftPurchase) => DraftPurchase,
  ) {
    setDrafts((current) => {
      const next = current.map((draft) =>
        draft.key === draftKey ? updater(draft) : draft,
      );
      draftsRef.current = next;
      return next;
    });
    setFormError(null);
  }

  function setPurchaseBranch(branchId: string) {
    setEntryBranchId(branchId);
    setDrafts((current) => {
      const next = current.map((draft) =>
        draft.savedPurchaseId
          ? draft
          : { ...draft, branchId, error: null },
      );
      draftsRef.current = next;
      return next;
    });
    setFormError(null);
    setSuccessMessage(null);
  }

  function startNewPurchase() {
    setDrafts((current) => {
      const next = [...current, newDraftPurchase(entryBranchId)];
      draftsRef.current = next;
      return next;
    });
    setSuccessMessage(null);
  }

  function removeDraft(draftKey: string) {
    lastSavedFingerprintRef.current.delete(draftKey);
    savingKeysRef.current.delete(draftKey);

    setDrafts((current) => {
      const remaining = current.filter((draft) => draft.key !== draftKey);
      const next =
        remaining.length > 0
          ? remaining
          : [newDraftPurchase(entryBranchId)];
      draftsRef.current = next;
      return next;
    });
    setSuccessMessage(null);
    setFormError(null);
  }

  function resetUnsavedDrafts() {
    setDrafts((current) => {
      const saved = current.filter((draft) => draft.savedPurchaseId);
      const next =
        saved.length > 0 ? saved : [newDraftPurchase(entryBranchId)];
      draftsRef.current = next;
      return next;
    });
    setFormError(null);
    setSuccessMessage(null);
  }

  function useSupplierForPurchase(nextId: string) {
    setSection("entry");
    setDrafts((current) => {
      const blank = current.find(
        (draft) =>
          !draft.savedPurchaseId &&
          !draft.supplierId &&
          !hasDraftProgress(draft),
      );
      let next: DraftPurchase[];
      if (blank) {
        next = current.map((draft) =>
          draft.key === blank.key
            ? {
              ...draft,
              supplierId: nextId,
              branchId: entryBranchId,
              error: null,
            }
            : draft,
        );
      } else {
        next = [...current, newDraftPurchase(entryBranchId, nextId)];
      }
      draftsRef.current = next;
      return next;
    });
    setSuccessMessage(null);
  }

  function commitDraft(draftKey: string): boolean {
    if (!canPurchase || savingKeysRef.current.has(draftKey)) return false;

    const draft = draftsRef.current.find((row) => row.key === draftKey);
    if (!draft || draft.savedPurchaseId) return false;

    const fingerprint = draftFingerprint(draft);
    if (lastSavedFingerprintRef.current.get(draftKey) === fingerprint) {
      return false;
    }

    const validationError = validateDraft(draft);
    if (validationError) {
      updateDraft(draftKey, (row) => ({ ...row, error: validationError }));
      return false;
    }

    const supplier =
      suppliers.find((row) => row.id === draft.supplierId) ?? null;
    if (!supplier) {
      updateDraft(draftKey, (row) => ({
        ...row,
        error: "Select a supplier for this purchase.",
      }));
      return false;
    }

    const draftTotal = roundMoney(
      draft.lines.reduce((sum, line) => sum + lineTotalValue(line), 0),
    );
    const paid = draft.paidFollowsTotal
      ? draftTotal
      : roundMoney(parseAmount(draft.paidDraft));
    savingKeysRef.current.add(draftKey);
    const result = recordPurchase({
      supplierId: supplier.id,
      supplierName: supplier.name,
      branchId: draft.branchId,
      paid,
      note: draft.note,
      attachments: draft.attachments,
      lines: draft.lines.filter(isLineComplete).map((line) => ({
        name: line.name.trim(),
        quantity: parseAmount(line.quantity),
        unit: line.unit.trim(),
        rate: parseAmount(line.rate),
      })),
    });
    savingKeysRef.current.delete(draftKey);

    if (!result.ok) {
      updateDraft(draftKey, (row) => ({ ...row, error: result.error }));
      return false;
    }

    lastSavedFingerprintRef.current.set(draftKey, fingerprint);
    updateDraft(draftKey, (row) => ({
      ...row,
      error: null,
      savedPurchaseId: result.purchase.id,
    }));
    return true;
  }

  function saveAllEntries(): boolean {
    if (!canPurchase) return false;

    const dirty = draftsRef.current.filter(isDraftDirty);
    if (dirty.length === 0) {
      setFormError(null);
      setSuccessMessage("Nothing new to save.");
      return true;
    }

    let allValid = true;
    for (const draft of dirty) {
      const validationError = validateDraft(draft);
      if (validationError) {
        allValid = false;
        updateDraft(draft.key, (row) => ({ ...row, error: validationError }));
      } else {
        updateDraft(draft.key, (row) => ({ ...row, error: null }));
      }
    }

    if (!allValid) {
      setSuccessMessage(null);
      setFormError("Fill every required field before saving.");
      return false;
    }

    let savedCount = 0;
    for (const draft of dirty) {
      if (commitDraft(draft.key)) savedCount += 1;
    }

    if (savedCount === 0) {
      setFormError("Could not save purchase entries.");
      setSuccessMessage(null);
      return false;
    }

    setFormError(null);
    setSuccessMessage(
      savedCount === 1
        ? "Purchase saved. Inventory updated."
        : `${savedCount} purchases saved. Inventory updated.`,
    );
    return true;
  }

  function finishLeave(href: string | null) {
    setLeaveHref(null);
    if (!href) return;
    router.push(href);
  }

  function discardAndLeave() {
    const href = leaveHref;
    resetUnsavedDrafts();
    hasUnsavedRef.current = false;
    finishLeave(href);
  }

  function saveAndLeave() {
    if (!saveAllEntries()) return;
    hasUnsavedRef.current = false;
    finishLeave(leaveHref);
  }

  function openNoteDialog(draft: DraftPurchase) {
    if (draft.savedPurchaseId) return;
    setNoteDialogDraftKey(draft.key);
    setNoteDraft(draft.note);
  }

  function saveNote() {
    if (!noteDialogDraftKey) return;
    const target = draftsRef.current.find(
      (draft) => draft.key === noteDialogDraftKey,
    );
    if (target?.savedPurchaseId) {
      setNoteDialogDraftKey(null);
      return;
    }
    const nextNote = noteDraft.trim();
    updateDraft(noteDialogDraftKey, (draft) => ({
      ...draft,
      note: nextNote,
      error: null,
    }));
    setNoteDialogDraftKey(null);
  }

  async function onAttachFiles(fileList: FileList | null) {
    const draftKey = attachDraftKey;
    if (!draftKey || !fileList || fileList.length === 0) return;

    const next: PurchaseAttachment[] = [];
    let attachError: string | null = null;
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        attachError = `“${file.name}” is too large (max 1.5 MB).`;
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        next.push({
          id: newKey("att"),
          name: file.name,
          dataUrl,
        });
      } catch {
        attachError = `Could not attach “${file.name}”.`;
      }
    }

    if (next.length > 0) {
      updateDraft(draftKey, (draft) => ({
        ...draft,
        attachments: [...draft.attachments, ...next],
        error: attachError,
      }));
    } else if (attachError) {
      updateDraft(draftKey, (draft) => ({ ...draft, error: attachError }));
    }

    setAttachDraftKey(null);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  const headerActionClass =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40";

  const lineFieldClass =
    "no-spinner min-h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800 outline-none transition hover:border-slate-300 focus:border-[var(--pos-accent)] focus:ring-2 focus:ring-[var(--pos-accent)]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60";

  return (
    <ModuleShell
      title="Item Purchase"
      actions={
        <div
          className="app-header-cluster relative"
          role="group"
          aria-label="Location"
          ref={branchMenuRef}
        >
          {showBranchSwitcher ? (
            <button
              type="button"
              onClick={() => setBranchMenuOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={branchMenuOpen}
              title="Switch branch"
              className="app-header-btn app-header-btn--label max-w-[7rem] gap-1 tracking-wide sm:max-w-[9rem]"
            >
              <span className="truncate">{entryBranchName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </button>
          ) : (
            <span
              className="app-header-btn app-header-btn--label app-header-btn--ghost max-w-[7rem] tracking-wide sm:max-w-[9rem]"
              title="Branch"
            >
              <span className="truncate">{entryBranchName}</span>
            </span>
          )}

          {branchMenuOpen ? (
            <ul
              role="listbox"
              aria-label="Switch branch"
              className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-slate-800 shadow-lg"
            >
              {accessible.map((branch) => {
                const selected = branch.id === entryBranchId;
                return (
                  <li key={branch.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => {
                        setPurchaseBranch(branch.id);
                        setBranchMenuOpen(false);
                      }}
                      className={`flex w-full px-3 py-2 text-left text-sm font-semibold ${selected
                          ? "bg-[var(--pos-accent-soft)] text-[var(--pos-header)]"
                          : "hover:bg-slate-50"
                        }`}
                    >
                      {branch.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      }
      secondaryBar={
        <nav
          aria-label="Item purchase sections"
          className="mx-auto w-full max-w-6xl px-3 sm:px-4"
        >
          <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((item) => {
              const Icon = item.icon;
              const selected = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.hint}
                  onClick={() => setSection(item.id)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${selected
                      ? "bg-[var(--pos-header)] text-pos-on-header"
                      : "text-slate-700 hover:bg-slate-100"
                    }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${selected ? "text-pos-on-header" : "text-slate-500"
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
      {section === "suppliers" ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
          <SuppliersPanel onUseForPurchase={useSupplierForPurchase} />
        </div>
      ) : (
        <>
          {!canPurchase ? (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              View only — you need inventory adjust access to record purchases.
            </p>
          ) : null}

          {successMessage ? (
            <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-sm text-emerald-900">{successMessage}</p>
            </div>
          ) : null}

          <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 p-2 sm:p-3">
              {drafts.map((draft) => {
                const purchaseTotal = roundMoney(
                  draft.lines.reduce(
                    (sum, line) => sum + lineTotalValue(line),
                    0,
                  ),
                );
                const paidAmount = draft.paidFollowsTotal
                  ? purchaseTotal
                  : (() => {
                    const paid = parseAmount(draft.paidDraft);
                    if (!(paid >= 0)) return 0;
                    return roundMoney(paid);
                  })();
                const paidFieldValue = draft.paidFollowsTotal
                  ? formatAmountField(purchaseTotal) || "0"
                  : draft.paidDraft;
                const dueAmount = roundMoney(purchaseTotal - paidAmount);
                const isSaved = Boolean(draft.savedPurchaseId);
                const fieldsLocked = !canPurchase || isSaved;

                return (
                  <div
                    key={draft.key}
                    className={`overflow-hidden rounded-lg border ${isSaved
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-slate-200 bg-white"
                      }`}
                  >
                    <div
                      className={`flex flex-col gap-2 border-b px-2.5 py-2 lg:flex-row lg:items-center lg:justify-between ${
                        isSaved
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-[var(--pos-accent-soft)]"
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        {isSaved ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            Saved
                          </span>
                        ) : null}
                        <div className="min-w-[11rem] flex-1 sm:max-w-[16rem]">
                          <Select
                            compact
                            aria-label="Supplier name"
                            value={draft.supplierId}
                            options={supplierOptions}
                            onChange={(value) => {
                              updateDraft(draft.key, (row) => ({
                                ...row,
                                supplierId: value,
                                error: null,
                              }));
                              setSuccessMessage(null);
                            }}
                            disabled={fieldsLocked}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => openNoteDialog(draft)}
                          disabled={fieldsLocked}
                          aria-label="Add note"
                          title={draft.note ? "Edit note" : "Add note"}
                          className={`${headerActionClass} ${draft.note ? "border-[var(--pos-accent)] text-[var(--pos-accent)]" : ""}`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAttachDraftKey(draft.key);
                            attachmentInputRef.current?.click();
                          }}
                          disabled={fieldsLocked}
                          aria-label="Attach file"
                          title="Attach file"
                          className={`${headerActionClass} ${draft.attachments.length > 0 ? "border-[var(--pos-accent)] text-[var(--pos-accent)]" : ""}`}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeDraft(draft.key)}
                          disabled={!canPurchase}
                          aria-label={
                            isSaved
                              ? "Dismiss saved purchase from this list"
                              : "Remove purchase entry"
                          }
                          title={
                            isSaved
                              ? "Dismiss from this list"
                              : drafts.length > 1
                                ? "Remove this supplier purchase"
                                : "Clear this purchase entry"
                          }
                          className={`${headerActionClass} hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-stretch gap-1.5">
                        <div className="inline-flex h-8 min-w-[6.25rem] items-center justify-between gap-1.5 rounded border border-slate-200 bg-white px-2 text-xs shadow-sm">
                          <span className="text-slate-500">Total</span>
                          <span className="font-semibold tabular-nums text-slate-800">
                            {purchaseTotal}
                          </span>
                        </div>

                        <label className="inline-flex h-8 min-w-[6.25rem] items-center justify-between gap-1.5 rounded border border-slate-200 bg-white px-2 text-xs shadow-sm">
                          <span className="text-slate-500">Paid</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={paidFieldValue}
                            onChange={(event) => {
                              const value = event.target.value;
                              updateDraft(draft.key, (row) => ({
                                ...row,
                                paidFollowsTotal: false,
                                paidDraft: value,
                                error: null,
                              }));
                              setSuccessMessage(null);
                            }}
                            disabled={fieldsLocked}
                            aria-label="Paid amount"
                            className="no-spinner w-14 border-0 bg-transparent p-0 text-right font-semibold tabular-nums text-slate-800 outline-none disabled:opacity-60"
                          />
                        </label>

                        <div className="inline-flex h-8 min-w-[6.25rem] items-center justify-between gap-1.5 rounded border border-slate-200 bg-white px-2 text-xs shadow-sm">
                          <span className="text-slate-500">Due</span>
                          <span
                            className={`font-semibold tabular-nums ${dueAmount < 0
                                ? "text-[var(--pos-accent)]"
                                : dueAmount > 0
                                  ? "text-rose-600"
                                  : "text-emerald-600"
                              }`}
                          >
                            {dueAmount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {(draft.note || draft.attachments.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-2.5 py-1.5 text-xs text-slate-600">
                        {draft.note ? (
                          <button
                            type="button"
                            onClick={() => openNoteDialog(draft)}
                            className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            Note:{" "}
                            {draft.note.length > 48
                              ? `${draft.note.slice(0, 48)}…`
                              : draft.note}
                          </button>
                        ) : null}
                        {draft.attachments.map((file) => (
                          <span
                            key={file.id}
                            className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 shadow-sm"
                          >
                            <Paperclip className="h-3 w-3" />
                            {file.name}
                            {!isSaved ? (
                              <button
                                type="button"
                                onClick={() => {
                                  updateDraft(draft.key, (row) => ({
                                    ...row,
                                    attachments: row.attachments.filter(
                                      (item) => item.id !== file.id,
                                    ),
                                  }));
                                }}
                                aria-label={`Remove ${file.name}`}
                                className="ml-0.5 text-slate-400 hover:text-rose-600"
                              >
                                ×
                              </button>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="overflow-x-auto bg-white">
                      <table className="w-full min-w-[36rem] border-collapse text-sm">
                        <thead>
                          <tr className="bg-[var(--pos-accent-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--pos-header)]">
                            <th className="px-2 py-1.5 text-left">Name</th>
                            <th className="w-20 px-1.5 py-1.5 text-center">Qty</th>
                            <th className="w-16 px-1 py-1.5 text-center">Unit</th>
                            <th className="w-28 px-1.5 py-1.5 text-center">Rate</th>
                            <th className="w-28 px-1.5 py-1.5 text-center">
                              Total
                            </th>
                            <th className="w-10 px-1 py-1.5 text-center">
                              <span className="sr-only">Remove</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.lines.map((line) => (
                            <tr
                              key={line.key}
                              className="border-t border-slate-100"
                            >
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={line.name}
                                  onChange={(event) => {
                                    updateDraft(draft.key, (row) => ({
                                      ...row,
                                      error: null,
                                      lines: row.lines.map((item) =>
                                        item.key === line.key
                                          ? applyLinePatch(item, {
                                            name: event.target.value,
                                          })
                                          : item,
                                      ),
                                    }));
                                    setSuccessMessage(null);
                                  }}
                                  placeholder="Item name"
                                  disabled={fieldsLocked}
                                  autoComplete="off"
                                  className={lineFieldClass}
                                />
                              </td>
                              <td className="w-20 px-1.5 py-1">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="any"
                                  value={line.quantity}
                                  onChange={(event) => {
                                    updateDraft(draft.key, (row) => ({
                                      ...row,
                                      error: null,
                                      lines: row.lines.map((item) =>
                                        item.key === line.key
                                          ? applyLinePatch(item, {
                                            quantity: event.target.value,
                                          })
                                          : item,
                                      ),
                                    }));
                                    setSuccessMessage(null);
                                  }}
                                  disabled={fieldsLocked}
                                  className={`${lineFieldClass} text-center`}
                                />
                              </td>
                              <td className="w-16 px-1 py-1">
                                <Select
                                  aria-label="Unit"
                                  compact
                                  value={line.unit}
                                  options={unitOptionsFor(line.unit)}
                                  onChange={(value) => {
                                    updateDraft(draft.key, (row) => ({
                                      ...row,
                                      error: null,
                                      lines: row.lines.map((item) =>
                                        item.key === line.key
                                          ? applyLinePatch(item, {
                                            unit: value,
                                          })
                                          : item,
                                      ),
                                    }));
                                    setSuccessMessage(null);
                                  }}
                                  disabled={fieldsLocked}
                                />
                              </td>
                              <td className="w-28 px-1.5 py-1">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="any"
                                  value={line.rate}
                                  onChange={(event) => {
                                    updateDraft(draft.key, (row) => ({
                                      ...row,
                                      error: null,
                                      lines: row.lines.map((item) =>
                                        item.key === line.key
                                          ? applyLinePatch(item, {
                                            rate: event.target.value,
                                          })
                                          : item,
                                      ),
                                    }));
                                    setSuccessMessage(null);
                                  }}
                                  disabled={fieldsLocked}
                                  className={`${lineFieldClass} text-right`}
                                />
                              </td>
                              <td className="w-28 px-1.5 py-1">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="any"
                                  value={line.total}
                                  onChange={(event) => {
                                    updateDraft(draft.key, (row) => ({
                                      ...row,
                                      error: null,
                                      lines: row.lines.map((item) =>
                                        item.key === line.key
                                          ? applyLinePatch(item, {
                                            total: event.target.value,
                                          })
                                          : item,
                                      ),
                                    }));
                                    setSuccessMessage(null);
                                  }}
                                  disabled={fieldsLocked}
                                  aria-label="Line total"
                                  className={`${lineFieldClass} text-right`}
                                />
                              </td>
                              <td className="px-1 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateDraft(draft.key, (row) => ({
                                      ...row,
                                      error: null,
                                      lines:
                                        row.lines.length <= 1
                                          ? [newDraftLine()]
                                          : row.lines.filter(
                                              (item) => item.key !== line.key,
                                            ),
                                    }));
                                  }}
                                  disabled={fieldsLocked}
                                  aria-label="Remove line"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {!isSaved ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-2.5 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            updateDraft(draft.key, (row) => ({
                              ...row,
                              error: null,
                              lines: [...row.lines, newDraftLine()],
                            }));
                            setSuccessMessage(null);
                          }}
                          disabled={!canPurchase}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded border border-[var(--pos-header)] bg-[var(--pos-header)] px-2.5 text-xs font-semibold text-pos-on-header hover:brightness-110 disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Item
                        </button>
                      </div>
                    ) : null}

                    {draft.error ? (
                      <p className="border-t border-rose-100 bg-rose-50 px-2.5 py-2 text-sm text-rose-800">
                        {draft.error}
                      </p>
                    ) : null}
                  </div>
                );
              })}

              <input
                ref={attachmentInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(event) => onAttachFiles(event.target.files)}
              />

              {formError ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={startNewPurchase}
                  disabled={!canPurchase}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded border border-[var(--pos-header)] bg-[var(--pos-header)] px-2.5 text-xs font-semibold text-pos-on-header hover:brightness-110 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Supplier
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveAllEntries();
                  }}
                  disabled={!canPurchase || !hasUnsavedChanges}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--pos-header)] px-5 text-sm font-semibold text-pos-on-header hover:brightness-110 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-slate-900">
                Recent purchases
              </h2>
              {recentPurchases.length > 0 ? (
                <p className="text-sm text-slate-500">
                  <span className="font-semibold tabular-nums text-slate-700">
                    {recentPurchases.length}
                  </span>{" "}
                  {recentPurchases.length === 1 ? "entry" : "entries"}
                </p>
              ) : null}
            </div>

            {recentPurchases.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Saved purchases will show up here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        When
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        Supplier
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">
                        Items
                      </th>
                      {branchOptions.length > 1 ? (
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          Branch
                        </th>
                      ) : null}
                      <th
                        scope="col"
                        className="px-3 py-2.5 text-right font-semibold"
                      >
                        Total
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Payment
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPurchases.map((purchase) => {
                      const branchName =
                        branches.find(
                          (branch) => branch.id === purchase.branchId,
                        )?.name ?? purchase.branchId;
                      const paid = purchase.paid ?? 0;
                      const due =
                        purchase.due ??
                        roundMoney(Math.max(0, purchase.total - paid));
                      const payStatus = purchasePayStatus(
                        paid,
                        due,
                        purchase.total,
                      );
                      const itemSummary = purchaseItemsSummary(purchase.lines);
                      const itemTitle = purchase.lines
                        .map(
                          (line) =>
                            `${line.quantity} ${line.unit} ${line.name} (${formatMoney(line.total)})`,
                        )
                        .join("\n");

                      return (
                        <tr
                          key={purchase.id}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3 align-middle text-sm text-slate-600">
                            {formatWhen(purchase.purchasedAt)}
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <p className="font-semibold text-slate-900">
                              {purchase.supplierName}
                            </p>
                            {purchase.note ? (
                              <p
                                className="mt-0.5 max-w-[12rem] truncate text-xs text-slate-400"
                                title={purchase.note}
                              >
                                {purchase.note}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 align-middle text-sm text-slate-600">
                            <p className="max-w-[16rem] truncate" title={itemTitle}>
                              {itemSummary}
                            </p>
                            <p className="text-xs text-slate-400">
                              {purchase.lines.length}{" "}
                              {purchase.lines.length === 1 ? "item" : "items"}
                            </p>
                          </td>
                          {branchOptions.length > 1 ? (
                            <td className="max-w-[9rem] truncate px-3 py-3 align-middle text-sm text-slate-600">
                              {branchName}
                            </td>
                          ) : null}
                          <td className="px-3 py-3 text-right align-middle font-semibold tabular-nums text-slate-900">
                            {formatMoney(purchase.total)}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span
                              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${payStatus.className}`}
                            >
                              {payStatus.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <PosDialog
            open={noteDialogDraft != null}
            title="Purchase note"
            onClose={() => setNoteDialogDraftKey(null)}
            footer={
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNoteDialogDraftKey(null)}
                  className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  className="min-h-10 rounded-md bg-[var(--pos-header)] px-4 text-sm font-semibold text-pos-on-header hover:brightness-110"
                >
                  Save note
                </button>
              </div>
            }
          >
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={5}
              placeholder="Invoice #, delivery instructions, etc."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2"
            />
          </PosDialog>

          <PosDialog
            open={leaveHref != null}
            title="Unsaved purchase entries"
            onClose={() => setLeaveHref(null)}
            footer={
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setLeaveHref(null)}
                  className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={discardAndLeave}
                  className="min-h-10 rounded-md border border-rose-300 bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={saveAndLeave}
                  disabled={!canPurchase}
                  className="min-h-10 rounded-md bg-[var(--pos-header)] px-4 text-sm font-semibold text-pos-on-header hover:brightness-110 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            }
          >
            <p className="text-sm text-slate-600">
              You have unsaved purchase entries. Save them before leaving, or
              discard to leave without saving.
            </p>
          </PosDialog>
        </>
      )}
    </ModuleShell>
  );
}
