import { round2 } from "./round";

export function dailyWage(gajiPokok: number, fullMonthEffectiveDays: number): number {
  if (fullMonthEffectiveDays <= 0) return 0;
  return round2(gajiPokok / fullMonthEffectiveDays);
}
