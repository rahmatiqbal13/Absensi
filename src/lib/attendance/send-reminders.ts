import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "./jakarta-date";
import { dueReminders, type ReminderEmployee, type ReminderSchedule } from "./reminder";
import { loadSchedules } from "@/lib/schedule/resolve";
import { jakartaMinutesOfDay } from "@/lib/payroll/minutes";
import { createNotifications } from "@/lib/notifications/create";

export type ReminderRunResult =
  | { ok: true; tanggal: string; due: number; created: number }
  | { ok: false; error: string };

/**
 * One reminder pass (run every 15 minutes by pg_cron, migration 0047): an
 * in-app notification for everyone whose clock-in is overdue. Needs the
 * service-role client: it reads every active employee and writes
 * notifications. A notification already sent today (jenis lupa_absen, kunci =
 * tanggal) is never sent again.
 */
export async function sendAttendanceReminders(db: SupabaseClient, now = new Date()): Promise<ReminderRunResult> {
  const tanggal = toJakartaDateOnly(now);
  const nowMinutes = jakartaMinutesOfDay(now.toISOString());

  const [empRes, schedRes, holRes, leaveRes, attRes, remRes] = await Promise.all([
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
    db.from("attendances").select("employee_id").eq("tanggal", tanggal),
    db.from("notifications").select("employee_id").eq("jenis", "lupa_absen").eq("kunci", tanggal),
  ]);
  const err = empRes.error ?? schedRes.error ?? holRes.error ?? leaveRes.error ?? attRes.error ?? remRes.error;
  if (err) {
    console.error("sendAttendanceReminders: query failed", err);
    return { ok: false, error: "query failed" };
  }

  const ids = (rows: { employee_id: string }[] | null) => new Set((rows ?? []).map((r) => r.employee_id));
  const due = dueReminders({
    tanggal,
    nowMinutes,
    employees: (empRes.data ?? []) as ReminderEmployee[],
    schedules: schedRes.data,
    holidays: (holRes.data ?? []) as { branch_id: string | null }[],
    onLeave: ids(leaveRes.data),
    attended: ids(attRes.data),
    reminded: ids(remRes.data),
  });

  const res = await createNotifications(
    db,
    due.map(({ employee, jamMasuk }) => ({
      employee_id: employee.id,
      jenis: "lupa_absen",
      kunci: tanggal,
      judul: "Anda belum absen masuk hari ini",
      isi: `Jadwal masuk Anda pukul ${jamMasuk} WIB. Kalau hari ini izin atau sakit, ajukan cuti.`,
      link: "/absen",
    })),
  );
  if (!res.ok) return { ok: false, error: "insert failed" };
  return { ok: true, tanggal, due: due.length, created: res.created };
}
