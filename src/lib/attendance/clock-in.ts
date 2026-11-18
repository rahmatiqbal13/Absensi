import type { SupabaseClient } from "@supabase/supabase-js";
import { geofenceState, isGeofenceConfigured } from "./geofencing";
import { verifyQrToken } from "./qr-token";
import { toJakartaDateOnly } from "./jakarta-date";
import { loadEmployeeSchedule } from "@/lib/schedule/resolve";
import { withRosterShift } from "@/lib/schedule/roster";
import { loadOfficeLocation } from "./office-location";
import { resolveClockInStatus, type AttendanceStatus } from "./status";
import { hasActiveConsent } from "@/lib/consent/consent";
import { isMissingColumn } from "@/lib/supabase/missing-column";
import { locationFlags } from "./location-flags";

// Postgres SQLSTATE for unique_violation, surfaced by PostgREST as
// PostgrestError.code — the `unique (employee_id, tanggal)` constraint on
// attendances is the race-condition backstop for the duplicate pre-check.
const PG_UNIQUE_VIOLATION = "23505";
const DUPLICATE_CLOCK_IN_MESSAGE = "Anda sudah absen masuk hari ini.";

// The kiosk QR payload is "<branchId uuid>|<16 lowercase hex token>". Validate
// the whole shape before trusting `.split("|")`.
const QR_PAYLOAD_RE = /^[0-9a-f-]{36}\|[0-9a-f]{16}$/;

export type ClockInInput = {
  employeeId: string;
  // Optional: absent on a QR clock-in with no GPS fix. Never fabricate (0,0).
  lat?: number;
  long?: number;
  photoPath: string;
  photoExpiresAt: string;
  catatan?: string;
  qrToken?: string;
  /** Approved dinas luar today (0058): anywhere counts as in place, no reason needed. */
  dinasLuar?: { tujuan: string } | null;
  /** GPS quality reported by the phone; see location-flags.ts. */
  accuracyMeters?: number;
  fixAgeSeconds?: number;
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
    .select("id, branch_id, department_id")
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

  // Separate, migration-tolerant lookup for the QR columns: pre-0031 the columns
  // don't exist, so selecting them in the main query above would error the whole
  // branch lookup and break every clock-in. When qrErr is truthy, treat QR as
  // unavailable and omit metode_masuk from the insert.
  const { data: qrRow, error: qrErr } = await db
    .from("branches")
    .select("qr_enabled, qr_secret")
    .eq("id", employee.branch_id)
    .maybeSingle();
  const qrColumnsExist = !qrErr;
  const branchQrEnabled = qrRow?.qr_enabled ?? false;
  const branchQrSecret = typeof qrRow?.qr_secret === "string" ? qrRow.qr_secret : null;

  // The department's own schedule when it has one, else the branch default.
  const { data: baseSchedule, error: scheduleErr } = await loadEmployeeSchedule<{
    jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number;
  }>(db, "jam_masuk, jam_pulang, toleransi_terlambat_menit", employee.branch_id, employee.department_id);
  if (scheduleErr || !baseSchedule) {
    return { ok: false, error: scheduleErr?.message ?? "Jadwal kerja cabang tidak ditemukan." };
  }
  // A rostered shift today (0059) replaces the regular times.
  const schedule = await withRosterShift(db, input.employeeId, tanggal, baseSchedule);

  // The department's own pin when it has one, else the branch's (0037).
  const office = await loadOfficeLocation(db, branch, employee.branch_id, employee.department_id);

  // A scanned kiosk QR is an admin-enabled alternative to the GPS geofence. When
  // one is presented and the branch has QR enabled, it must verify or the
  // clock-in is rejected outright — it never falls through to the GPS path.
  let metode: "gps" | "qr" = "gps";
  let qrVerified = false;
  if (input.qrToken !== undefined && branchQrEnabled) {
    if (!QR_PAYLOAD_RE.test(String(input.qrToken))) {
      return { ok: false, error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang." };
    }
    const [payloadBranchId, payloadToken] = String(input.qrToken).split("|");
    const okQr =
      payloadBranchId === branch.id &&
      typeof branchQrSecret === "string" &&
      verifyQrToken(branchQrSecret, payloadToken ?? "", now.getTime());
    if (!okQr) {
      return { ok: false, error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang." };
    }
    qrVerified = true;
    metode = "qr";
  }

  const hasCoords =
    typeof input.lat === "number" &&
    typeof input.long === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.long);
  // Absent coords only reach here on the QR path (the action rejects a coordless
  // GPS clock-in). Treat as "no fix": a verified QR already proves presence.
  const geo = hasCoords
    ? geofenceState(input.lat as number, input.long as number, office, office.radius_geofencing_meter)
    : // No fix: the branch geofence may still be configured, so a non-QR
      // clock-in here must still be gated on a reason (not silently allowed).
      { configured: isGeofenceConfigured(office), distanceMeters: null, withinRadius: false };
  // A verified QR proves presence, and so does an approved dinas luar for the
  // day: the geofence and its reason gate are skipped.
  const withinRadius = qrVerified || !!input.dinasLuar ? true : geo.withinRadius;

  // A whitespace-only catatan is not a reason — treat it as absent. On dinas
  // luar the destination is recorded when nothing else was written.
  const catatan = input.catatan?.trim() || (input.dinasLuar && !qrVerified ? `Dinas luar: ${input.dinasLuar.tujuan}` : null);

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

  const insertPayload: Record<string, unknown> = {
    employee_id: input.employeeId,
    tanggal,
    jam_masuk: now.toISOString(),
    lokasi_masuk: hasCoords ? `(${input.lat},${input.long})` : null,
    foto_masuk_url: input.photoPath,
    foto_masuk_expires_at: input.photoExpiresAt,
    status,
    catatan,
  };
  // metode_masuk only exists post-0031.
  if (qrColumnsExist) insertPayload.metode_masuk = metode;

  // GPS quality for HR review (0046). Only on the GPS path: a verified QR
  // already proves presence. Added only when there is something to record.
  const gpsAudit: Record<string, unknown> = {};
  if (hasCoords && !qrVerified) {
    if (input.accuracyMeters !== undefined) gpsAudit.akurasi_masuk_meter = input.accuracyMeters;
    const flags = locationFlags({
      lat: input.lat as number,
      long: input.long as number,
      accuracyMeters: input.accuracyMeters,
      fixAgeSeconds: input.fixAgeSeconds,
      now,
    });
    if (flags.length > 0) gpsAudit.flag_lokasi_masuk = flags;
  }

  const insert = (payload: Record<string, unknown>) =>
    db.from("attendances").insert(payload).select().single();
  let { data: inserted, error: insertErr } = await insert({ ...insertPayload, ...gpsAudit });
  // Pre-0046 the audit columns don't exist; never lose a clock-in over them.
  if (isMissingColumn(insertErr) && Object.keys(gpsAudit).length > 0) {
    console.warn("clockIn: kolom akurasi/flag lokasi belum ada — jalankan migrasi 0046.");
    ({ data: inserted, error: insertErr } = await insert(insertPayload));
  }

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
