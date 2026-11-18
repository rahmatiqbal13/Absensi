import { pickSchedule, type ScheduleScope } from "@/lib/schedule/resolve";
import { scheduleMinutes } from "@/lib/payroll/minutes";
import { dayPlan, type Roster } from "@/lib/schedule/roster";

/**
 * "Lupa absen" reminder: an employee is due once their own schedule's clock-in
 * time plus tolerance has passed (the moment they would become `terlambat`)
 * and they still have no attendance row today. Not sent after the scheduled
 * clock-out time, on a non-working day of their schedule, on a holiday, during
 * approved leave, before their start date, or to super admins (system
 * accounts that don't clock in). At most once per employee per day — the
 * caller passes who was already notified today (notifications, jenis lupa_absen).
 */
export type ReminderEmployee = {
  id: string;
  nama: string;
  role: string;
  branch_id: string;
  department_id: string | null;
  tanggal_mulai_kerja: string | null;
};

export type ReminderSchedule = ScheduleScope & {
  jam_masuk: string;
  jam_pulang: string;
  toleransi_terlambat_menit: number;
  hari_kerja: number[];
};

export type DueReminder = { employee: ReminderEmployee; jamMasuk: string };

export function dueReminders(input: {
  /** Asia/Jakarta calendar date, "YYYY-MM-DD". */
  tanggal: string;
  /** Minutes since Asia/Jakarta midnight, now. */
  nowMinutes: number;
  employees: readonly ReminderEmployee[];
  schedules: readonly ReminderSchedule[];
  /** Holidays for `tanggal`: branch_id null = applies to every branch. */
  holidays: readonly { branch_id: string | null }[];
  /** Employees with approved leave covering `tanggal`. */
  onLeave: ReadonlySet<string>;
  /** Employees who already have an attendance row for `tanggal`. */
  attended: ReadonlySet<string>;
  /** Employees already reminded for `tanggal`. */
  reminded: ReadonlySet<string>;
  /** Shift roster per employee (0059): today's shift times, or libur. */
  rosters?: Map<string, Roster>;
}): DueReminder[] {
  const orgHoliday = input.holidays.some((h) => h.branch_id === null);
  const branchHoliday = new Set(input.holidays.map((h) => h.branch_id).filter((b): b is string => b !== null));

  const due: DueReminder[] = [];
  for (const e of input.employees) {
    if (e.role === "super_admin") continue;
    if (input.attended.has(e.id) || input.reminded.has(e.id) || input.onLeave.has(e.id)) continue;
    if (e.tanggal_mulai_kerja && e.tanggal_mulai_kerja > input.tanggal) continue;
    const s = pickSchedule(input.schedules, e.branch_id, e.department_id);
    if (!s) continue;
    const plan = dayPlan(
      {
        jamMasuk: s.jam_masuk.slice(0, 5),
        jamPulang: s.jam_pulang.slice(0, 5),
        toleransiMenit: Number(s.toleransi_terlambat_menit || 0),
        hariKerja: s.hari_kerja,
      },
      input.tanggal,
      orgHoliday || branchHoliday.has(e.branch_id),
      input.rosters?.get(e.id),
    );
    if (!plan.working) continue;
    const lateFrom = scheduleMinutes(plan.jamMasuk) + plan.toleransiMenit;
    if (input.nowMinutes < lateFrom || input.nowMinutes >= scheduleMinutes(plan.jamPulang)) continue;

    due.push({ employee: e, jamMasuk: plan.jamMasuk });
  }
  return due;
}
