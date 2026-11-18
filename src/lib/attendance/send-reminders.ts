import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "./jakarta-date";
import { dueReminders, type ReminderEmployee, type ReminderSchedule } from "./reminder";
import { loadSchedules } from "@/lib/schedule/resolve";
import { jakartaMinutesOfDay } from "@/lib/payroll/minutes";
import { sendEmailBatch, escapeHtml } from "@/lib/email/send";
import { appUrl } from "@/lib/app-url";

export type ReminderRunResult =
  | { ok: true; tanggal: string; due: number; sent: number; failed: number }
  | { ok: false; error: string };

const TANGGAL_FMT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * One reminder pass (run every 15 minutes by pg_cron, migration 0047). Needs
 * the service-role client: it reads every active employee and writes
 * attendance_reminders, which has no RLS policies.
 */
export async function sendAttendanceReminders(db: SupabaseClient, now = new Date()): Promise<ReminderRunResult> {
  const tanggal = toJakartaDateOnly(now);
  const nowMinutes = jakartaMinutesOfDay(now.toISOString());

  const [empRes, schedRes, holRes, leaveRes, attRes, remRes] = await Promise.all([
    db
      .from("employees")
      .select("id, nama, email, role, branch_id, department_id, tanggal_mulai_kerja")
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
    db.from("attendance_reminders").select("employee_id").eq("tanggal", tanggal),
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
  if (due.length === 0) return { ok: true, tanggal, due: 0, sent: 0, failed: 0 };

  // Claim before sending: only the rows this run actually inserted get an
  // email, so two overlapping runs can't both remind the same person.
  const { data: claimed, error: claimErr } = await db
    .from("attendance_reminders")
    .upsert(
      due.map((d) => ({ employee_id: d.employee.id, tanggal })),
      { onConflict: "employee_id,tanggal", ignoreDuplicates: true },
    )
    .select("employee_id");
  if (claimErr) {
    console.error("sendAttendanceReminders: claim failed", claimErr);
    return { ok: false, error: "claim failed" };
  }
  const mine = ids(claimed);
  const toSend = due.filter((d) => mine.has(d.employee.id));

  const link = `${appUrl()}/absen`;
  const hari = TANGGAL_FMT.format(new Date(`${tanggal}T00:00:00Z`));
  const { sent, failed } = await sendEmailBatch(
    toSend.map(({ employee, jamMasuk }) => ({
      to: employee.email,
      subject: "Anda belum absen masuk hari ini",
      text:
        `Halo ${employee.nama},\n\n` +
        `Sampai sekarang belum ada absen masuk Anda untuk ${hari}. Jadwal masuk Anda pukul ${jamMasuk} WIB.\n\n` +
        `Absen di: ${link}\n\n` +
        `Kalau hari ini Anda izin atau sakit, abaikan email ini dan ajukan cuti di aplikasi.\n`,
      html:
        `<p>Halo ${escapeHtml(employee.nama)},</p>` +
        `<p>Sampai sekarang belum ada absen masuk Anda untuk ${escapeHtml(hari)}. ` +
        `Jadwal masuk Anda pukul <b>${escapeHtml(jamMasuk)} WIB</b>.</p>` +
        `<p><a href="${escapeHtml(link)}">Absen sekarang</a></p>` +
        `<p style="color:#666">Kalau hari ini Anda izin atau sakit, abaikan email ini dan ajukan cuti di aplikasi.</p>`,
    })),
  );
  return { ok: true, tanggal, due: toSend.length, sent, failed };
}
