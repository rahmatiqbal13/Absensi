import type { SupabaseClient } from "@supabase/supabase-js";
import { isWithinRadius } from "./geofencing";
import { toJakartaDateOnly } from "./jakarta-date";
import { resolveClockOutStatus, mergeAttendanceStatus, type AttendanceStatus } from "./status";

export type ClockOutInput = {
  employeeId: string;
  lat: number;
  long: number;
  photoPath: string;
  photoExpiresAt: string;
  now?: Date;
};

export type ClockOutResult = { ok: true; status: AttendanceStatus } | { ok: false; error: string };

export async function clockOut(db: SupabaseClient, input: ClockOutInput): Promise<ClockOutResult> {
  const now = input.now ?? new Date();
  // Asia/Jakarta calendar date — must match the key Task 6's clockIn wrote.
  const tanggal = toJakartaDateOnly(now);

  const { data: today, error: todayErr } = await db
    .from("attendances")
    .select("id, status, jam_pulang")
    .eq("employee_id", input.employeeId)
    .eq("tanggal", tanggal)
    .single();
  if (todayErr || !today) {
    return { ok: false, error: "Anda belum absen masuk hari ini." };
  }
  if (today.jam_pulang) {
    return { ok: false, error: "Anda sudah absen pulang hari ini." };
  }

  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .select("id, branch_id")
    .eq("id", input.employeeId)
    .single();
  if (employeeErr || !employee) {
    return { ok: false, error: employeeErr?.message ?? "Data karyawan tidak ditemukan." };
  }

  const { data: branch, error: branchErr } = await db
    .from("branches")
    .select("id, lat, long, radius_geofencing_meter")
    .eq("id", employee.branch_id)
    .single();
  if (branchErr || !branch) {
    return { ok: false, error: branchErr?.message ?? "Data cabang tidak ditemukan." };
  }

  const { data: schedule, error: scheduleErr } = await db
    .from("work_schedules")
    .select("jam_pulang")
    .eq("branch_id", employee.branch_id)
    .single();
  if (scheduleErr || !schedule) {
    return { ok: false, error: scheduleErr?.message ?? "Jadwal kerja cabang tidak ditemukan." };
  }

  const withinRadius = isWithinRadius(
    input.lat,
    input.long,
    branch.lat,
    branch.long,
    branch.radius_geofencing_meter,
  );

  const clockOutStatus = resolveClockOutStatus({
    clockOutTime: now,
    scheduledEnd: schedule.jam_pulang.slice(0, 5),
    withinRadius,
  });

  const finalStatus = mergeAttendanceStatus(today.status as AttendanceStatus, clockOutStatus);

  const { data: updated, error: updateErr } = await db
    .from("attendances")
    .update({
      jam_pulang: now.toISOString(),
      lokasi_pulang: `(${input.lat},${input.long})`,
      foto_pulang_url: input.photoPath,
      foto_pulang_expires_at: input.photoExpiresAt,
      status: finalStatus,
    })
    .eq("id", today.id)
    .select()
    .single();

  if (updateErr || !updated) {
    return { ok: false, error: updateErr?.message ?? "Gagal menyimpan absen pulang." };
  }

  return { ok: true, status: finalStatus };
}
