/** PRD §6: annual leave applies after 12 consecutive months of service. */
export const ANNUAL_LEAVE_MIN_MONTHS = 12;

/** "YYYY-MM-DD" + n months, clamped to the month's last day (Jan 31 + 1 → Feb 28/29). */
export function addMonths(dateOnly: string, months: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/** First date annual leave may start, or null when the join date is unknown. */
export function annualLeaveEligibleFrom(tanggalMulaiKerja: string | null): string | null {
  return tanggalMulaiKerja ? addMonths(tanggalMulaiKerja, ANNUAL_LEAVE_MIN_MONTHS) : null;
}

/** Sick leave longer than one day needs a doctor's note (PRD §6). */
export function requiresAttachment(jenis: string, days: number): boolean {
  return jenis === "sakit" && days > 1;
}
