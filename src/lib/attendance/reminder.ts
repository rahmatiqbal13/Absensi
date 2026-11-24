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

type PlanInput = {
  tanggal: string;
  schedules: readonly ReminderSchedule[];
  holidays: readonly { branch_id: string | null }[];
  onLeave: ReadonlySet<string>;
  rosters?: Map<string, Roster>;
  /** employee id → jadwal khusus id (0065). */
  assignments?: Map<string, string>;
};

/** Today's plan for an employee who should clock in today, or null. */
function workingPlan(e: ReminderEmployee, input: PlanInput) {
  if (e.role === "super_admin" || input.onLeave.has(e.id)) return null;
  if (e.tanggal_mulai_kerja && e.tanggal_mulai_kerja > input.tanggal) return null;
  const s = pickSchedule(input.schedules, e.branch_id, e.department_id, input.assignments?.get(e.id));
  if (!s) return null;
  const orgHoliday = input.holidays.some((h) => h.branch_id === null);
  const plan = dayPlan(
    {
      jamMasuk: s.jam_masuk.slice(0, 5),
      jamPulang: s.jam_pulang.slice(0, 5),
      toleransiMenit: Number(s.toleransi_terlambat_menit || 0),
      hariKerja: s.hari_kerja,
    },
    input.tanggal,
    orgHoliday || input.holidays.some((h) => h.branch_id === e.branch_id),
    input.rosters?.get(e.id),
  );
  return plan.working ? plan : null;
}

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
  /** Minutes after jam masuk + toleransi to wait before reminding (0060). Default 0. */
  menitSetelah?: number;
}): DueReminder[] {
  const due: DueReminder[] = [];
  for (const e of input.employees) {
    if (input.attended.has(e.id) || input.reminded.has(e.id)) continue;
    const plan = workingPlan(e, input);
    if (!plan) continue;
    const lateFrom = scheduleMinutes(plan.jamMasuk) + plan.toleransiMenit + (input.menitSetelah ?? 0);
    if (input.nowMinutes < lateFrom || input.nowMinutes >= scheduleMinutes(plan.jamPulang)) continue;

    due.push({ employee: e, jamMasuk: plan.jamMasuk });
  }
  return due;
}

/**
 * Pengingat absen at the employee's own schedule times (each kind at most
 * once per employee per day; the cron pass runs every 5 minutes):
 * - "masuk": `menitMasuk` before jam masuk, while they haven't clocked in.
 * - "pulang": `menitPulang` after jam pulang, while they clocked in but not out.
 * Each is sent within a short window after its time, so a missed or late cron
 * pass still delivers it, but never hours later. Same skips as the "lupa
 * absen" reminder (non-working day, holiday, leave, roster libur, not started
 * yet, super admin).
 */
export const PENGINGAT_MASUK_WINDOW_MINUTES = 15;
export const PENGINGAT_PULANG_WINDOW_MINUTES = 60;

export type DueClockReminder = { employee: ReminderEmployee; kind: "masuk" | "pulang"; jam: string };

export function dueClockReminders(
  input: PlanInput & {
    nowMinutes: number;
    employees: readonly ReminderEmployee[];
    /** Today's attendance per employee: whether they have clocked out yet. */
    attendance: ReadonlyMap<string, { clockedOut: boolean }>;
    /** Employees already sent today's "masuk" / "pulang" reminder. */
    remindedMasuk: ReadonlySet<string>;
    remindedPulang: ReadonlySet<string>;
    /** Minutes before jam masuk (default 15); null = this reminder is off. */
    menitMasuk?: number | null;
    /** Minutes after jam pulang (default 0); null = this reminder is off. */
    menitPulang?: number | null;
  },
): DueClockReminder[] {
  const menitMasuk = input.menitMasuk === undefined ? 15 : input.menitMasuk;
  const menitPulang = input.menitPulang === undefined ? 0 : input.menitPulang;
  const due: DueClockReminder[] = [];
  for (const e of input.employees) {
    const plan = workingPlan(e, input);
    if (!plan) continue;
    const masuk = scheduleMinutes(plan.jamMasuk);
    const pulang = scheduleMinutes(plan.jamPulang);
    const att = input.attendance.get(e.id);

    if (menitMasuk !== null && !att && !input.remindedMasuk.has(e.id)) {
      const from = masuk - menitMasuk;
      if (input.nowMinutes >= from && input.nowMinutes < from + PENGINGAT_MASUK_WINDOW_MINUTES) {
        due.push({ employee: e, kind: "masuk", jam: plan.jamMasuk });
      }
    }
    // Overnight shifts (pulang before masuk) end on the next calendar day;
    // their clock-out reminder isn't supported yet.
    if (menitPulang !== null && att && !att.clockedOut && pulang > masuk && !input.remindedPulang.has(e.id)) {
      const from = pulang + menitPulang;
      if (input.nowMinutes >= from && input.nowMinutes < from + PENGINGAT_PULANG_WINDOW_MINUTES) {
        due.push({ employee: e, kind: "pulang", jam: plan.jamPulang });
      }
    }
  }
  return due;
}
