export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

// `bulan` is 1-12 (as stored in payroll_periods.bulan). Out-of-range returns "-".
export function monthLabel(bulan: number): string {
  return MONTH_NAMES_ID[bulan - 1] ?? "-";
}
