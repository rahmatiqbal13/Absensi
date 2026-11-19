import type { RosterBucket } from "./today-roster";

/**
 * Board colours and letter glyphs per bucket. A plain module (no "use client")
 * so both the server TodayBoard legend and the client RosterGroups can read the
 * object itself — a value imported from a client module into a server component
 * is only a client reference.
 */
export const BUCKET_STYLE: Record<RosterBucket, { label: string; swatch: string; glyph: string; fg: string }> = {
  tepat: { label: "Tepat waktu", swatch: "bg-success-solid", glyph: "", fg: "text-primary-foreground" },
  terlambat: { label: "Terlambat", swatch: "bg-warning-solid", glyph: "T", fg: "text-highlight-foreground" },
  pulangCepat: { label: "Pulang cepat", swatch: "bg-early-solid", glyph: "P", fg: "text-highlight-foreground" },
  diLuarLokasi: { label: "Di luar lokasi", swatch: "bg-info-solid", glyph: "L", fg: "text-highlight-foreground" },
  alpa: { label: "Alpa / belum absen", swatch: "bg-danger-solid", glyph: "A", fg: "text-primary-foreground" },
  cuti: { label: "Cuti", swatch: "bg-leave-solid", glyph: "C", fg: "text-primary-foreground" },
};
