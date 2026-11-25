export const LEAVE_TYPES_WITH_BALANCE_CHECK = ["tahunan"] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  return diffDays + 1;
}

function* eachDate(from: string, to: string): Generator<string> {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** Working days in [from, to]: weekday in `hariKerja` (0=Sun..6=Sat) and not a holiday. */
export function countWorkingDays(
  from: string,
  to: string,
  hariKerja: number[],
  holidayDates: Iterable<string>,
): number {
  const dows = new Set(hariKerja);
  const holidays = new Set(holidayDates);
  let n = 0;
  for (const date of eachDate(from, to)) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dows.has(dow) && !holidays.has(date)) n += 1;
  }
  return n;
}

/**
 * What approving cuti tahunan charges, per year: the working days of each
 * year's part of the range (approve_leave_request, migration 0069). Years with
 * no working day are left out.
 */
export function leaveChargeByYear(
  from: string,
  to: string,
  hariKerja: number[],
  holidayDates: Iterable<string>,
): Map<number, number> {
  const holidays = [...holidayDates];
  const out = new Map<number, number>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    const a = from > `${y}-01-01` ? from : `${y}-01-01`;
    const b = to < `${y}-12-31` ? to : `${y}-12-31`;
    const n = countWorkingDays(a, b, hariKerja, holidays);
    if (n > 0) out.set(y, n);
  }
  return out;
}

export function requiresBalanceCheck(jenis: string): boolean {
  return (LEAVE_TYPES_WITH_BALANCE_CHECK as readonly string[]).includes(jenis);
}

export function hasSufficientBalance(saldoSisa: number, requestedDays: number): boolean {
  return requestedDays <= saldoSisa;
}
