/** Soft limit for compressed staff avatars in IndexedDB. */
export const MAX_AVATAR_BYTES = 120_000;

const MAX_SOURCE_BYTES = 8_000_000;
const MAX_EDGE_PX = 256;
const JPEG_QUALITY = 0.8;

/** Fruit emoji avatars for staff without a photo. */
export const STAFF_AVATAR_EMOJIS = [
  "🍎",
  "🍐",
  "🍊",
  "🍋",
  "🍌",
  "🍉",
  "🍇",
  "🍓",
  "🫐",
  "🍈",
  "🍒",
  "🍑",
  "🥭",
  "🍍",
  "🥥",
  "🥝",
  "🍅",
  "🥑",
] as const;

/** Stable fruit picks for the classic demo roster. */
export const DEMO_STAFF_EMOJIS: Record<string, string> = {
  kyle: "🍎",
  maya: "🍓",
  sam: "🍋",
  riya: "🍇",
  nadia: "🥭",
};

const AVATAR_TONES = [
  "bg-rose-100 text-rose-800",
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-900",
  "bg-emerald-100 text-emerald-800",
  "bg-teal-100 text-teal-800",
  "bg-sky-100 text-sky-800",
  "bg-indigo-100 text-indigo-800",
  "bg-fuchsia-100 text-fuchsia-800",
] as const;

const emojiSizeClass = {
  xs: "text-sm leading-none",
  sm: "text-base leading-none",
  md: "text-xl leading-none",
  lg: "text-4xl leading-none",
} as const;

export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function staffAvatarTone(seed: string): string {
  return AVATAR_TONES[hashSeed(seed) % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

export function staffAvatarEmoji(seed: string): string {
  return (
    STAFF_AVATAR_EMOJIS[hashSeed(seed) % STAFF_AVATAR_EMOJIS.length] ??
    STAFF_AVATAR_EMOJIS[0]
  );
}

export function isStaffAvatarEmoji(emoji: string | null | undefined): boolean {
  return Boolean(
    emoji && (STAFF_AVATAR_EMOJIS as readonly string[]).includes(emoji),
  );
}

/** Prefer a valid fruit emoji, then demo map, then a stable seed pick. */
export function resolveStaffAvatarEmoji(
  id: string,
  avatarEmoji?: string | null,
): string {
  const explicit = avatarEmoji?.trim();
  if (isStaffAvatarEmoji(explicit)) return explicit!;
  return DEMO_STAFF_EMOJIS[id] ?? staffAvatarEmoji(id);
}

export function staffEmojiClass(size: keyof typeof emojiSizeClass): string {
  return emojiSizeClass[size];
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = dataUrl;
  });
}

async function compressAvatarDataUrl(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = MAX_EDGE_PX;
  canvas.height = MAX_EDGE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  // Center-crop to a square for consistent circular avatars.
  const side = Math.min(image.width, image.height);
  const sx = (image.width - side) / 2;
  const sy = (image.height - side) / 2;
  ctx.drawImage(image, sx, sy, side, side, 0, 0, MAX_EDGE_PX, MAX_EDGE_PX);

  try {
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return dataUrl;
  }
}

export async function avatarFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a PNG, JPG, or WebP image.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Image is too large (max 8 MB).");
  }

  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        reject(new Error("Could not read that image."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });

  const compressed = await compressAvatarDataUrl(raw);
  if (compressed.length > MAX_AVATAR_BYTES * 1.37) {
    throw new Error("Avatar must be under 120 KB after compression.");
  }
  return compressed;
}
