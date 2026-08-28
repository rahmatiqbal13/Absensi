const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export type DerivedAccent = { primary: string; primaryForeground: string; ring: string };

export function normalizeHex(hex: string): string {
  if (!HEX_RE.test(hex)) throw new Error(`Invalid hex color: ${hex}`);
  return hex.toUpperCase();
}

function channelLuminance(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = normalizeHex(hex);
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const WHITE = "#FFFFFF";
const NEAR_BLACK = "#0A0A0A";

export function deriveAccent(hex: string): DerivedAccent {
  const primary = normalizeHex(hex);
  const onWhite = contrastRatio(primary, WHITE);
  const onBlack = contrastRatio(primary, NEAR_BLACK);
  const primaryForeground = onWhite >= onBlack ? WHITE : NEAR_BLACK;
  return { primary, primaryForeground, ring: primary };
}

export function accentWarning(hex: string): string | null {
  const best = Math.max(contrastRatio(hex, WHITE), contrastRatio(hex, NEAR_BLACK));
  return best < 4.5
    ? "Warna ini kontras rendah dengan teks — tombol mungkin sulit dibaca."
    : null;
}
