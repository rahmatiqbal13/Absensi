import type { SupabaseClient } from "@supabase/supabase-js";
import { geofenceState } from "./geofencing";
import { verifyQrToken } from "./qr-token";
import { toJakartaDateOnly } from "./jakarta-date";
import { resolveClockInStatus, type AttendanceStatus } from "./status";
import { hasActiveConsent } from "@/lib/consent/consent";

// Postgres SQLSTATE for unique_violation, surfaced by PostgREST as
// PostgrestError.code — the `unique (employee_id, tanggal)` constraint on
// attendances is the race-condition backstop for the duplicate pre-check.
const PG_UNIQUE_VIOLATION = "23505";
const DUPLICATE_CLOCK_IN_MESSAGE = "Anda sudah absen masuk hari ini.";

export type ClockInInput = {
  employeeId: string;
  lat: number;
  long: number;
  photoPath: string;
  photoExpiresAt: string;
  catatan?: string;
  qrToken?: string;
  now?: Date;
};

export type ClockInResult =
  | { ok: true; attendanceId: string; status: AttendanceStatus }
  | { ok: false; error: string };

export async function clockIn(db: SupabaseClient, input: ClockInInput): Promise<ClockInResult> {
  const now = input.now ?? new Date();

  const hasConsent = await hasActiveConsent(db, input.employeeId);
  if (!hasConsent) {
    return { ok: false, error: "Persetujuan pemrosesan data lokasi/foto diperlukan sebelum absen." };
  }

  const tanggal = toJakartaDateOnly(now);

  const { data: existing, error: existingErr } = await db
    .from("attendances")
    .select("id")
    .eq("employee_id", input.employeeId)
    .eq("tanggal", tanggal)
    .limit(1);
  // Fail closed: a failed duplicate check must not fall through as "no
  // duplicate found", which would let a second row be attempted for the day.
  if (existingErr) {
    console.error("clockIn: duplicate check failed", existingErr);
    return { ok: false, error: "Gagal memeriksa absensi hari ini." };
  }
  if (existing && existing.length > 0) {
    return { ok: false, error: DUPLICATE_CLOCK_IN_MESSAGE };
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
    .select("id, lat, long, radius_geofencing_meter, qr_enabled, qr_secret")
    .eq("id", employee.branch_id)
    .single();
  if (branchErr || !branch) {
    return { ok: false, error: branchErr?.message ?? "Data cabang tidak ditemukan." };
  }

  const { data: schedule, error: scheduleErr } = await db
    .from("work_schedules")
    .select("jam_masuk, jam_pulang, toleransi_terlambat_menit")
    .eq("branch_id", employee.branch_id)
    // work_schedules has no unique constraint on branch_id alone (a branch may
    // have several rows for different hari_kerja patterns), so .single() would
    // error with PGRST116 as soon as a second row exists. Taking the first row
    // keeps this path working; picking the row matching today's hari_kerja is
    // deliberately out of scope here.
    .limit(1)
    .maybeSingle();
  if (scheduleErr || !schedule) {
    return { ok: false, error: scheduleErr?.message ?? "Jadwal kerja cabang tidak ditemukan." };
  }

  // A scanned kiosk QR is an admin-enabled alternative to the GPS geofence. When
  // one is presented and the branch has QR enabled, it must verify or the
  // clock-in is rejected outright — it never falls through to the GPS path.
  let metode: "gps" | "qr" = "gps";
  let qrVerified = false;
  if (input.qrToken !== undefined && branch.qr_enabled) {
    const [payloadBranchId, payloadToken] = String(input.qrToken).split("|");
    const okQr =
      payloadBranchId === branch.id &&
      typeof branch.qr_secret === "string" &&
      verifyQrToken(branch.qr_secret, payloadToken ?? "", now.getTime());
    if (!okQr) {
      return { ok: false, error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang." };
    }
    qrVerified = true;
    metode = "qr";
  }

  const geo = geofenceState(input.lat, input.long, branch, branch.radius_geofencing_meter);
  // A verified QR proves presence; the geofence and its reason gate are skipped.
  const withinRadius = qrVerified ? true : geo.withinRadius;

  // A whitespace-only catatan is not a reason — treat it as absent.
  const catatan = input.catatan?.trim() || null;

  // Only force a reason when the branch geofence is actually configured. If an
  // admin has not set the office point yet, do not block the employee for it.
  if (!qrVerified && geo.configured && !withinRadius && !catatan) {
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
      catatan,
      metode_masuk: metode,
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    // Never surface raw Postgres/PostgREST text to the user: it is English,
    // internal, and can disclose schema details. Log it, return Indonesian.
    console.error("clockIn: insert failed", insertErr);
    if (insertErr?.code === PG_UNIQUE_VIOLATION) {
      // Lost the race against a concurrent clock-in; same invariant as the
      // pre-check above, so the user sees the same message.
      return { ok: false, error: DUPLICATE_CLOCK_IN_MESSAGE };
    }
    return { ok: false, error: "Gagal menyimpan absensi." };
  }

  return { ok: true, attendanceId: inserted.id, status };
}
