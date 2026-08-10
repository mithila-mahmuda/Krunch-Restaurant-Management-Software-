"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Accessible name when no visible label is shown. */
  "aria-label"?: string;
  className?: string;
  /** Compact trigger for dense table cells. */
  compact?: boolean;
}

type MenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function Select({
  value,
  options,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
  className = "",
  compact = false,
}: SelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? value,
    [options, value],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const preferredMaxHeight = 208;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(120, Math.min(preferredMaxHeight, available));
      const width = Math.max(rect.width, 136);

      setMenuPosition({
        top: openUp ? undefined : rect.bottom + 4,
        bottom: openUp
          ? window.innerHeight - rect.top + 4
          : undefined,
        left: Math.min(
          rect.left,
          window.innerWidth - width - viewportPadding,
        ),
        width,
        maxHeight,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: globalThis.MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, options, value]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? options.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        current >= options.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option.value);
    }
  }

  const menuStyle: CSSProperties | undefined = menuPosition
    ? {
        position: "fixed",
        top: menuPosition.top,
        bottom: menuPosition.bottom,
        left: menuPosition.left,
        width: menuPosition.width,
        maxHeight: menuPosition.maxHeight,
      }
    : undefined;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
        className={`flex w-full items-center gap-1.5 rounded-md border bg-white text-left text-sm font-medium text-slate-800 transition outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
          compact
            ? "min-h-9 min-w-[6.5rem] border-slate-200 px-2.5"
            : "min-h-10 border-slate-300 px-3"
        } ${
          open
            ? "border-[var(--pos-accent)] ring-2 ring-[var(--pos-accent)]/20"
            : "hover:border-slate-300 hover:bg-slate-50 focus-visible:border-[var(--pos-accent)] focus-visible:ring-2 focus-visible:ring-[var(--pos-accent)]/20"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {mounted && open && menuPosition
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              style={menuStyle}
              className="z-50 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;
                return (
                  <li key={option.value} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(option.value)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition ${
                        selected
                          ? "bg-[var(--pos-accent-soft)] text-slate-900"
                          : active
                            ? "bg-slate-50 text-slate-800"
                            : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {selected ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--pos-header)]" />
                      ) : (
                        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
