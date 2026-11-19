import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "./jakarta-date";
import { dueClockReminders, dueReminders, type ReminderEmployee, type ReminderSchedule } from "./reminder";
import { loadSchedules } from "@/lib/schedule/resolve";
import { loadRoster } from "@/lib/schedule/roster";
import { jakartaMinutesOfDay } from "@/lib/payroll/minutes";
import { createNotifications, type NewNotification } from "@/lib/notifications/create";
import { loadReminderSettings, renderReminder, type ReminderSetting } from "./reminder-settings";

export type ReminderRunResult =
  | { ok: true; tanggal: string; due: number; created: number }
  | { ok: false; error: string };

/** Notification keys (jenis lupa_absen) per kind of reminder, for one day. */
export const reminderKeys = (tanggal: string) => ({
  terlambat: tanggal,
  masuk: `${tanggal}:masuk`,
  pulang: `${tanggal}:pulang`,
});

/**
 * One reminder pass (run every 5 minutes by pg_cron, migrations 0047/0060): an
 * in-app + push notification shortly before each employee's own jam masuk,
 * at their jam pulang if they haven't clocked out, and once their clock-in is
 * overdue — each on/off, timed and worded as HR set in Pengumuman > Reminder
 * (0060). Needs the service-role client: it reads every active employee and
 * writes notifications. Each kind is sent at most once a day (jenis lupa_absen, kunci
 * from `reminderKeys`).
 */
export async function sendAttendanceReminders(db: SupabaseClient, now = new Date()): Promise<ReminderRunResult> {
  const tanggal = toJakartaDateOnly(now);
  const nowMinutes = jakartaMinutesOfDay(now.toISOString());
  const keys = reminderKeys(tanggal);

  const [empRes, schedRes, holRes, leaveRes, attRes, remRes, { settings }] = await Promise.all([
    db
      .from("employees")
      .select("id, nama, role, branch_id, department_id, tanggal_mulai_kerja")
      .eq("status", "aktif"),
    loadSchedules<Omit<ReminderSchedule, "branch_id" | "department_id">>(
      db,
      "jam_masuk, jam_pulang, toleransi_terlambat_menit, hari_kerja",
    ),
    db.from("holidays").select("branch_id").eq("tanggal", tanggal),
    db
      .from("leave_requests")
      .select("employee_id")
      .eq("status", "approved")
      .lte("tanggal_mulai", tanggal)
      .gte("tanggal_selesai", tanggal),
    db.from("attendances").select("employee_id, jam_pulang").eq("tanggal", tanggal),
    db
      .from("notifications")
      .select("employee_id, kunci")
      .eq("jenis", "lupa_absen")
      .in("kunci", [keys.terlambat, keys.masuk, keys.pulang]),
    // HR's texts and times (0060); defaults before the migration.
    loadReminderSettings(db),
  ]);
  const err = empRes.error ?? schedRes.error ?? holRes.error ?? leaveRes.error ?? attRes.error ?? remRes.error;
  if (err) {
    console.error("sendAttendanceReminders: query failed", err);
    return { ok: false, error: "query failed" };
  }

  const ids = (rows: { employee_id: string }[] | null) => new Set((rows ?? []).map((r) => r.employee_id));
  const sentWith = (kunci: string) =>
    ids(((remRes.data ?? []) as { employee_id: string; kunci: string }[]).filter((r) => r.kunci === kunci));
  const attendance = (attRes.data ?? []) as { employee_id: string; jam_pulang: string | null }[];
  const employees = (empRes.data ?? []) as ReminderEmployee[];
  const rosters = await loadRoster(db, employees.map((e) => e.id), tanggal, tanggal);
  const common = {
    rosters,
    tanggal,
    nowMinutes,
    employees,
    schedules: schedRes.data,
    holidays: (holRes.data ?? []) as { branch_id: string | null }[],
    onLeave: ids(leaveRes.data),
  };
  const late = settings.terlambat.aktif
    ? dueReminders({
        ...common,
        attended: ids(attendance),
        reminded: sentWith(keys.terlambat),
        menitSetelah: settings.terlambat.menit,
      })
    : [];
  const clock = dueClockReminders({
    ...common,
    attendance: new Map(attendance.map((a) => [a.employee_id, { clockedOut: a.jam_pulang != null }])),
    remindedMasuk: sentWith(keys.masuk),
    remindedPulang: sentWith(keys.pulang),
    menitMasuk: settings.masuk.aktif ? settings.masuk.menit : null,
    menitPulang: settings.pulang.aktif ? settings.pulang.menit : null,
  });

  const notice = (employee: ReminderEmployee, setting: ReminderSetting, kunci: string, jam: string): NewNotification => {
    const vars = { nama: employee.nama, jam };
    return {
      employee_id: employee.id,
      jenis: "lupa_absen",
      kunci,
      judul: renderReminder(setting.judul, vars),
      isi: renderReminder(setting.isi, vars),
      link: "/absen",
    };
  };
  const rows: NewNotification[] = [
    ...clock.map(({ employee, kind, jam }) => notice(employee, settings[kind], keys[kind], jam)),
    ...late.map(({ employee, jamMasuk }) => notice(employee, settings.terlambat, keys.terlambat, jamMasuk)),
  ];

  const res = await createNotifications(db, rows);
  if (!res.ok) return { ok: false, error: "insert failed" };
  return { ok: true, tanggal, due: rows.length, created: res.created };
}
