import { round2 } from "./round";
import { jakartaMinutesOfDay, scheduleMinutes } from "./minutes";

/**
 * Workday overtime (Kepmenakertrans 102/2004 Pasal 11; PP 35/2021):
 *   hourly wage = 1/173 × monthly wage
 *   first hour × 1.5, every following hour × 2, at most 4 hours a day.
 * Counted only from the scheduled end of day, and only once it reaches 30
 * minutes (shorter stays are not overtime). Paid pro rata by the minute.
 */
export const OVERTIME_MIN_MINUTES = 30;
export const OVERTIME_MAX_MINUTES = 4 * 60;

export function overtimeMinutes(jamPulangIso: string | null, scheduleJamPulang: string): number {
  if (!jamPulangIso) return 0;
  const over = jakartaMinutesOfDay(jamPulangIso) - scheduleMinutes(scheduleJamPulang);
  if (over < OVERTIME_MIN_MINUTES) return 0;
  return Math.min(over, OVERTIME_MAX_MINUTES);
}

export function overtimePay(minutes: number, gajiPokok: number): number {
  if (!(minutes > 0) || !(gajiPokok > 0)) return 0;
  const hourly = gajiPokok / 173;
  const first = Math.min(minutes, 60);
  const rest = Math.max(0, minutes - 60);
  return round2(hourly * 1.5 * (first / 60) + hourly * 2 * (rest / 60));
}

/** An approved lembur window for one day, "HH:MM" WIB (migration 0058). */
export type ApprovedOvertime = { jamMulai: string; jamSelesai: string };

/**
 * Paid overtime minutes with pre-approval: only time inside an approved
 * window, after the scheduled end, and before the real clock-out counts.
 * Without an approval nothing is paid. Same 30-minute floor and 4-hour cap.
 */
export function approvedOvertimeMinutes(
  jamPulangIso: string | null,
  scheduleJamPulang: string,
  approvals: readonly ApprovedOvertime[] | undefined,
): number {
  if (!jamPulangIso || !approvals?.length) return 0;
  const actualEnd = jakartaMinutesOfDay(jamPulangIso);
  const scheduleEnd = scheduleMinutes(scheduleJamPulang);
  let total = 0;
  for (const a of approvals) {
    const start = Math.max(scheduleEnd, scheduleMinutes(a.jamMulai));
    const end = Math.min(actualEnd, scheduleMinutes(a.jamSelesai));
    if (end > start) total += end - start;
  }
  if (total < OVERTIME_MIN_MINUTES) return 0;
  return Math.min(total, OVERTIME_MAX_MINUTES);
}
