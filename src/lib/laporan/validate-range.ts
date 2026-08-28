// src/lib/laporan/validate-range.ts
export type RangeResult =
  | { ok: true; from: string; to: string }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

export function validateRecapRange(dari: unknown, sampai: unknown): RangeResult {
  const from = String(dari ?? "");
  const to = String(sampai ?? "");
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { ok: false, error: "Tanggal harus format YYYY-MM-DD." };
  }
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { ok: false, error: "Tanggal tidak valid." };
  }
  // Reject e.g. 2026-13-45 / 2026-02-30 that Date.parse rolled over.
  if (
    new Date(fromMs).toISOString().slice(0, 10) !== from ||
    new Date(toMs).toISOString().slice(0, 10) !== to
  ) {
    return { ok: false, error: "Tanggal tidak valid." };
  }
  if (fromMs > toMs) {
    return { ok: false, error: "Tanggal 'dari' harus sebelum atau sama dengan 'sampai'." };
  }
  if ((toMs - fromMs) / 86_400_000 > MAX_DAYS) {
    return { ok: false, error: "Rentang tanggal maksimal 1 tahun." };
  }
  return { ok: true, from, to };
}
