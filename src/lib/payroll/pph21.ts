import { round2 } from "./round";

export const DEFAULT_TARIF_PPH21_PERSEN = 1;

/**
 * Flat-rate PPh 21 withholding (migration 0036). The base is the wage actually
 * earned in the month — gaji pokok minus attendance deductions — never below 0.
 */
export function pph21(penghasilanBruto: number, tarifPersen: number): number {
  if (!(penghasilanBruto > 0) || !(tarifPersen > 0)) return 0;
  return round2((penghasilanBruto * tarifPersen) / 100);
}

/** "1%", "0,5%" — Indonesian decimal comma. */
export function formatPersen(tarif: number): string {
  return `${Number(tarif.toFixed(2)).toString().replace(".", ",")}%`;
}

// ---------- TER (PP 58/2023, migration 0039) ----------

export type TerKategori = "A" | "B" | "C";
export type TerBracket = { kategori: TerKategori; batasBawah: number; tarifPersen: number };
export type Pph21Config =
  | { metode: "tarif_tetap"; tarifPersen: number }
  | { metode: "ter"; brackets: TerBracket[]; kategoriByPtkp: Record<string, TerKategori> };

export type Pph21Result = { tarifPersen: number; kategori: TerKategori | null; amount: number };

/** TER rate for a monthly gross: the bracket with the largest lower bound <= bruto. */
export function terRate(brackets: readonly TerBracket[], kategori: TerKategori, bruto: number): number {
  let rate = 0;
  let best = -1;
  for (const b of brackets) {
    if (b.kategori === kategori && b.batasBawah <= bruto && b.batasBawah > best) {
      best = b.batasBawah;
      rate = b.tarifPersen;
    }
  }
  return rate;
}

/** Monthly PPh 21 withholding for one employee under the configured method. */
export function computePph21(config: Pph21Config, bruto: number, statusPtkp: string | null | undefined): Pph21Result {
  if (config.metode === "tarif_tetap") {
    return { tarifPersen: config.tarifPersen, kategori: null, amount: pph21(bruto, config.tarifPersen) };
  }
  const kategori = config.kategoriByPtkp[statusPtkp ?? "TK/0"] ?? config.kategoriByPtkp["TK/0"] ?? "A";
  const tarifPersen = terRate(config.brackets, kategori, bruto);
  return { tarifPersen, kategori, amount: pph21(bruto, tarifPersen) };
}

/** Validates an edited bracket table for one category; returns rows sorted by lower bound. */
export function validateTerBrackets(
  rows: { batasBawah: number; tarifPersen: number }[],
): { ok: true; rows: { batasBawah: number; tarifPersen: number }[] } | { ok: false; error: string } {
  if (rows.length === 0) return { ok: false, error: "Tabel tidak boleh kosong." };
  for (const r of rows) {
    if (!Number.isFinite(r.batasBawah) || r.batasBawah < 0 || !Number.isInteger(r.batasBawah)) {
      return { ok: false, error: "Batas bawah harus bilangan bulat rupiah ≥ 0." };
    }
    if (!Number.isFinite(r.tarifPersen) || r.tarifPersen < 0 || r.tarifPersen > 100) {
      return { ok: false, error: "Tarif harus 0–100%." };
    }
  }
  const sorted = [...rows].sort((a, b) => a.batasBawah - b.batasBawah);
  if (sorted[0].batasBawah !== 0) return { ok: false, error: "Baris pertama harus mulai dari Rp 0." };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].batasBawah === sorted[i - 1].batasBawah) return { ok: false, error: "Ada batas bawah yang sama." };
  }
  return { ok: true, rows: sorted };
}
