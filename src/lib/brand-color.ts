/** Default Krunch navy — matches globals.css `--pos-header`. */
export const DEFAULT_BRAND_COLOR = "#163a63";

/** Quick picks for Settings → Restaurant brand. */
export const BRAND_COLOR_PRESETS = [
  { label: "Krunch navy", value: "#163a63" },
  { label: "Forest", value: "#1b4332" },
  { label: "Burgundy", value: "#6b1d2a" },
  { label: "Charcoal", value: "#1f2937" },
  { label: "Teal", value: "#0f766e" },
  { label: "Indigo", value: "#3730a3" },
  { label: "Copper", value: "#9a3412" },
  { label: "Plum", value: "#581c87" },
] as const;

const BRAND_VARS = [
  "--pos-header",
  "--pos-menu",
  "--pos-canvas",
  "--pos-accent",
] as const;

export function normalizeBrandColor(value: string | null | undefined): string {
  if (!value) return DEFAULT_BRAND_COLOR;
  const raw = value.trim();
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return DEFAULT_BRAND_COLOR;
  return hex.toLowerCase();
}

/** Paint POS chrome from one brand hex (header, accents, soft fills). */
export function applyBrandColor(color: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const brand = normalizeBrandColor(color);
  const root = document.documentElement.style;
  root.setProperty("--pos-header", brand);
  root.setProperty("--pos-menu", `color-mix(in srgb, ${brand} 72%, white)`);
  root.setProperty("--pos-canvas", `color-mix(in srgb, ${brand} 58%, white)`);
  root.setProperty("--pos-accent", `color-mix(in srgb, ${brand} 70%, #60a5fa)`);
  // --pos-accent-soft stays in CSS so light/dark modes both derive correctly.
  // --pos-selected tracks --pos-header via globals.css.
}

/** Drop inline overrides so CSS defaults return (login / sign-out). */
export function clearBrandColor(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  for (const name of BRAND_VARS) {
    root.removeProperty(name);
  }
  // Legacy inline selected overrides (older builds).
  root.removeProperty("--pos-selected");
  root.removeProperty("--pos-selected-deep");
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Sample a logo data-URL and pick a usable brand hex.
 * Skips transparent / near-white / near-black; prefers saturated colors.
 */
export async function pickThemeColorFromImageDataUrl(
  dataUrl: string,
): Promise<string | null> {
  if (typeof document === "undefined" || !dataUrl) return null;

  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
  if (!image || !image.width || !image.height) return null;

  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, size, size);
  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }

  // Quantize into coarse buckets; score = count * saturation * value.
  const buckets = new Map<string, { r: number; g: number; b: number; score: number }>();

  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] ?? 0;
    if (a < 200) continue;

    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2 / 255;
    const delta = max - min;
    const saturation = max === 0 ? 0 : delta / max;

    // Skip washed-out whites, pure blacks, and gray paper.
    if (lightness > 0.92 || lightness < 0.08) continue;
    if (saturation < 0.12 && lightness > 0.75) continue;
    if (saturation < 0.08) continue;

    const qr = Math.round(r / 24) * 24;
    const qg = Math.round(g / 24) * 24;
    const qb = Math.round(b / 24) * 24;
    const key = `${qr},${qg},${qb}`;
    const weight = 1 + saturation * 2.2 + (1 - Math.abs(lightness - 0.4)) * 0.6;
    const existing = buckets.get(key);
    if (existing) {
      existing.score += weight;
    } else {
      buckets.set(key, { r: qr, g: qg, b: qb, score: weight });
    }
  }

  let best: { r: number; g: number; b: number; score: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.score > best.score) best = bucket;
  }
  if (!best) return null;

  // Nudge very bright picks slightly darker so chrome stays readable.
  let { r, g, b } = best;
  const max = Math.max(r, g, b) / 255;
  if (max > 0.85) {
    r *= 0.78;
    g *= 0.78;
    b *= 0.78;
  }

  return normalizeBrandColor(rgbToHex(r, g, b));
}
