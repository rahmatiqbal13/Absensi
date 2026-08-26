import type { SupabaseClient } from "@supabase/supabase-js";
import { isWithinRadius } from "./geofencing";
import { resolveClockInStatus, type AttendanceStatus } from "./status";
import { hasActiveConsent } from "@/lib/consent/consent";

export type ClockInInput = {
  employeeId: string;
  lat: number;
  long: number;
  photoPath: string;
  photoExpiresAt: string;
  catatan?: string;
  now?: Date;
};

export type ClockInResult =
  | { ok: true; attendanceId: string; status: AttendanceStatus }
  | { ok: false; error: string };

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function clockIn(db: SupabaseClient, input: ClockInInput): Promise<ClockInResult> {
  const now = input.now ?? new Date();

  const hasConsent = await hasActiveConsent(db, input.employeeId);
  if (!hasConsent) {
    return { ok: false, error: "Persetujuan pemrosesan data lokasi/foto diperlukan sebelum absen." };
  }

  const tanggal = toDateOnly(now);

  const { data: existing } = await db
    .from("attendances")
    .select("id")
    .eq("employee_id", input.employeeId)
    .eq("tanggal", tanggal)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false, error: "Anda sudah absen masuk hari ini." };
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
    .select("jam_masuk, jam_pulang, toleransi_terlambat_menit")
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

  if (!withinRadius && !input.catatan) {
    return { ok: false, error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan." };
  }

  const status = resolveClockInStatus({
    clockInTime: now,
    scheduledStart: schedule.jam_masuk.slice(0, 5),
    toleranceMinutes: schedule.toleransi_terlambat_menit,
    withinRadius,
  });

  const { data: inserted, error: insertErr } = await db
    .from("attendances")
    .insert({
      employee_id: input.employeeId,
      tanggal,
      jam_masuk: now.toISOString(),
      lokasi_masuk: `(${input.lat},${input.long})`,
      foto_masuk_url: input.photoPath,
      foto_masuk_expires_at: input.photoExpiresAt,
      status,
      catatan: input.catatan ?? null,
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? "Gagal menyimpan absensi." };
  }

  return { ok: true, attendanceId: inserted.id, status };
}
