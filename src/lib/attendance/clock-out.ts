import type { SupabaseClient } from "@supabase/supabase-js";
import { isWithinRadius } from "./geofencing";
import { toJakartaDateOnly } from "./jakarta-date";
import { resolveClockOutStatus, mergeAttendanceStatus, type AttendanceStatus } from "./status";

// PostgREST's "no rows returned" code, surfaced as PostgrestError.code when a
// `.single()` matches zero rows. On the update below that means the atomic
// `jam_pulang is null` filter did NOT match — i.e. the row was already closed.
const PGRST_NO_ROWS = "PGRST116";
const DUPLICATE_CLOCK_OUT_MESSAGE = "Anda sudah absen pulang hari ini.";

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
  // A genuine "no row for today" (PGRST116, or null data with no error) means
  // the employee has not clocked in. Any OTHER error is an infrastructure
  // failure and must not be reported as "you haven't clocked in" — that
  // message is actively misleading and invites a pointless retry.
  if (todayErr && todayErr.code !== PGRST_NO_ROWS) {
    console.error("clockOut: today lookup failed", todayErr);
    return { ok: false, error: "Gagal memeriksa absensi hari ini." };
  }
  if (!today) {
    return { ok: false, error: "Anda belum absen masuk hari ini." };
  }
  if (today.jam_pulang) {
    return { ok: false, error: DUPLICATE_CLOCK_OUT_MESSAGE };
  }

  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .select("id, branch_id")
    .eq("id", input.employeeId)
    .single();
  if (employeeErr || !employee) {
    // Never surface raw Postgres/PostgREST text to the user: it is English,
    // internal, and can disclose schema details. Log it, return Indonesian.
    console.error("clockOut: employee lookup failed", employeeErr);
    return { ok: false, error: "Data karyawan tidak ditemukan." };
  }

  const { data: branch, error: branchErr } = await db
    .from("branches")
    .select("id, lat, long, radius_geofencing_meter")
    .eq("id", employee.branch_id)
    .single();
  if (branchErr || !branch) {
    console.error("clockOut: branch lookup failed", branchErr);
    return { ok: false, error: "Data cabang tidak ditemukan." };
  }

  const { data: schedule, error: scheduleErr } = await db
    .from("work_schedules")
    .select("jam_pulang")
    .eq("branch_id", employee.branch_id)
    // work_schedules has no unique constraint on branch_id alone (a branch may
    // have several rows for different hari_kerja patterns), so .single() would
    // error with PGRST116 as soon as a second row exists. Taking the first row
    // keeps this path working; picking the row matching today's hari_kerja is
    // deliberately out of scope here. Mirrors clockIn.
    .limit(1)
    .maybeSingle();
  if (scheduleErr || !schedule) {
    console.error("clockOut: work schedule lookup failed", scheduleErr);
    return { ok: false, error: "Jadwal kerja cabang tidak ditemukan." };
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
    // Atomic backstop for the `today.jam_pulang` pre-check above, which is a
    // read-then-write race: two concurrent clock-outs can both pass it, and the
    // later write would overwrite jam_pulang/photos/status — letting an employee
    // launder their final status by firing two requests. The DB anti-tampering
    // trigger (prevent_attendance_status_backdating, migration 0010) does NOT
    // cover this path: it is gated on `auth.uid() = old.employee_id`, and
    // clockOut always runs with a service-role client where auth.uid() is NULL,
    // so its guard body never executes. Restricting the UPDATE to rows whose
    // jam_pulang is still NULL makes "close the record" a single atomic
    // compare-and-set — the loser matches zero rows instead of overwriting.
    .is("jam_pulang", null)
    .select()
    .single();

  if (updateErr || !updated) {
    // Zero rows matched: another request closed the record between the
    // pre-check and this write. Report it exactly as the pre-check does, so
    // both paths read identically to the user.
    if (updateErr?.code === PGRST_NO_ROWS || (!updateErr && !updated)) {
      return { ok: false, error: DUPLICATE_CLOCK_OUT_MESSAGE };
    }
    console.error("clockOut: update failed", updateErr);
    return { ok: false, error: "Gagal menyimpan absen pulang." };
  }

  return { ok: true, status: finalStatus };
}
