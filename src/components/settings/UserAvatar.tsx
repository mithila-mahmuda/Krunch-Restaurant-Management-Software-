"use client";

import { useRef } from "react";
import { Camera, X } from "lucide-react";
import {
  avatarFromFile,
  resolveStaffAvatarEmoji,
  staffAvatarTone,
  staffEmojiClass,
  staffInitials,
} from "@/lib/staff-avatar";

const sizeClass = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-14 w-14 text-sm",
  lg: "h-24 w-24 text-2xl",
} as const;

export function UserAvatar({
  name,
  seed,
  avatarDataUrl,
  avatarEmoji,
  canEdit = false,
  size = "sm",
  onChange,
  onError,
}: {
  name: string;
  seed: string;
  avatarDataUrl?: string | null;
  avatarEmoji?: string | null;
  canEdit?: boolean;
  size?: keyof typeof sizeClass;
  onChange?: (dataUrl: string | null) => void;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = staffInitials(name || "User");
  const emoji = resolveStaffAvatarEmoji(seed, avatarEmoji);
  const tone = staffAvatarTone(seed || name || "user");
  const editable = Boolean(canEdit && onChange);

  async function onFileSelected(file: File | null) {
    if (!file || !editable || !onChange) return;
    try {
      const dataUrl = await avatarFromFile(file);
      onChange(dataUrl);
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : "Could not use that image.",
      );
    }
  }

  const face = (
    <>
      {avatarDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL avatar
        <img
          src={avatarDataUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : emoji ? (
        <span className={staffEmojiClass(size)} aria-hidden>
          {emoji}
        </span>
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </>
  );

  const faceClass = `relative flex items-center justify-center overflow-hidden rounded-full font-bold transition ${
    sizeClass[size]
  } ${avatarDataUrl ? "bg-slate-100" : tone}`;

  return (
    <div className="relative shrink-0">
      {editable ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title={avatarDataUrl ? "Change photo" : "Add photo"}
          aria-label={
            avatarDataUrl
              ? `Change photo for ${name || "user"}`
              : `Add photo for ${name || "user"}`
          }
          className={`${faceClass} ring-offset-2 hover:ring-2 hover:ring-[var(--pos-header)] focus-visible:ring-2 focus-visible:ring-[var(--pos-header)]`}
        >
          {face}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition hover:bg-black/35 hover:opacity-100">
            <Camera
              className={
                size === "lg" ? "h-6 w-6 text-white" : "h-3.5 w-3.5 text-white"
              }
            />
          </span>
        </button>
      ) : (
        <span
          className={faceClass}
          title={name}
          aria-label={`Avatar for ${name || "user"}`}
          role="img"
        >
          {face}
        </span>
      )}
      {editable ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void onFileSelected(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      ) : null}
      {editable && avatarDataUrl && onChange ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-rose-600"
          aria-label={`Remove photo for ${name || "user"}`}
          title="Remove photo"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
