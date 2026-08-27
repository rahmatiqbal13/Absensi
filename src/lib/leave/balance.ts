export const LEAVE_TYPES_WITH_BALANCE_CHECK = ["tahunan"] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  return diffDays + 1;
}

export function requiresBalanceCheck(jenis: string): boolean {
  return (LEAVE_TYPES_WITH_BALANCE_CHECK as readonly string[]).includes(jenis);
}

export function hasSufficientBalance(saldoSisa: number, requestedDays: number): boolean {
  return requestedDays <= saldoSisa;
}
