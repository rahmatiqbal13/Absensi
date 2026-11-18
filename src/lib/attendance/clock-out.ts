import type { SupabaseClient } from "@supabase/supabase-js";
import { geofenceState, isGeofenceConfigured } from "./geofencing";
import { verifyQrToken } from "./qr-token";
import { toJakartaDateOnly } from "./jakarta-date";
import { loadEmployeeSchedule } from "@/lib/schedule/resolve";
import { withRosterShift } from "@/lib/schedule/roster";
import { loadOfficeLocation } from "./office-location";
import { resolveClockOutStatus, mergeAttendanceStatus, type AttendanceStatus } from "./status";
import { isMissingColumn } from "@/lib/supabase/missing-column";
import { locationFlags, parsePoint } from "./location-flags";

// PostgREST's "no rows returned" code, surfaced as PostgrestError.code when a
// `.single()` matches zero rows. On the update below that means the atomic
// `jam_pulang is null` filter did NOT match — i.e. the row was already closed.
const PGRST_NO_ROWS = "PGRST116";
const DUPLICATE_CLOCK_OUT_MESSAGE = "Anda sudah absen pulang hari ini.";

// The kiosk QR payload is "<branchId uuid>|<16 lowercase hex token>". Validate
// the whole shape before trusting `.split("|")`.
const QR_PAYLOAD_RE = /^[0-9a-f-]{36}\|[0-9a-f]{16}$/;

export type ClockOutInput = {
  employeeId: string;
  // Optional: absent on a QR clock-out with no GPS fix. Never fabricate (0,0).
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

export type ClockOutResult = { ok: true; status: AttendanceStatus } | { ok: false; error: string };

export async function clockOut(db: SupabaseClient, input: ClockOutInput): Promise<ClockOutResult> {
  const now = input.now ?? new Date();
  // Asia/Jakarta calendar date — must match the key Task 6's clockIn wrote.
  const tanggal = toJakartaDateOnly(now);

  const { data: today, error: todayErr } = await db
    .from("attendances")
    .select("id, status, jam_pulang, catatan, jam_masuk, lokasi_masuk")
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
    .select("id, branch_id, department_id")
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

  // Separate, migration-tolerant lookup for the QR columns: pre-0031 the columns
  // don't exist, so selecting them in the main query above would error the whole
  // branch lookup and break every clock-out. When qrErr is truthy, treat QR as
  // unavailable and omit metode_pulang from the update.
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
    jam_pulang: string;
  }>(db, "jam_pulang", employee.branch_id, employee.department_id);
  if (scheduleErr || !baseSchedule) {
    console.error("clockOut: work schedule lookup failed", scheduleErr);
    return { ok: false, error: "Jadwal kerja cabang tidak ditemukan." };
  }
  // A rostered shift today (0059) replaces the regular times.
  const schedule = await withRosterShift(db, input.employeeId, tanggal, baseSchedule);

  // The department's own pin when it has one, else the branch's (0037).
  const office = await loadOfficeLocation(db, branch, employee.branch_id, employee.department_id);

  // A scanned kiosk QR is an admin-enabled alternative to the GPS geofence. When
  // one is presented and the branch has QR enabled, it must verify or the
  // clock-out is rejected outright — it never falls through to the GPS path.
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
  // GPS clock-out). Treat as "no fix": a verified QR already proves presence.
  const geo = hasCoords
    ? geofenceState(input.lat as number, input.long as number, office, office.radius_geofencing_meter)
    : // No fix: the branch geofence may still be configured, so a non-QR
      // clock-out here must still be gated on a reason (not silently allowed).
      { configured: isGeofenceConfigured(office), distanceMeters: null, withinRadius: false };
  // A verified QR proves presence, and so does an approved dinas luar for the
  // day: the geofence and its reason gate are skipped.
  const withinRadius = qrVerified || !!input.dinasLuar ? true : geo.withinRadius;

  // A whitespace-only catatan is not a reason — treat it as absent. (On dinas
  // luar the destination was already noted at clock-in.)
  const catatan = input.catatan?.trim() || null;

  // Only force a reason when the branch geofence is actually configured. If an
  // admin has not set the office point yet, do not block the employee for it.
  if (!qrVerified && geo.configured && !withinRadius && !catatan) {
    return { ok: false, error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan." };
  }

  const clockOutStatus = resolveClockOutStatus({
    clockOutTime: now,
    scheduledEnd: schedule.jam_pulang.slice(0, 5),
    withinRadius,
  });

  const finalStatus = mergeAttendanceStatus(today.status as AttendanceStatus, clockOutStatus);

  const updatePayload: Record<string, unknown> = {
    jam_pulang: now.toISOString(),
    lokasi_pulang: hasCoords ? `(${input.lat},${input.long})` : null,
    foto_pulang_url: input.photoPath,
    foto_pulang_expires_at: input.photoExpiresAt,
    status: finalStatus,
  };
  // metode_pulang only exists post-0031.
  if (qrColumnsExist) updatePayload.metode_pulang = metode;
  // Persist the out-of-radius reason only when one was given. `catatan` is a
  // single column shared with clock-in, so append rather than overwrite an
  // existing clock-in reason. Never write null.
  if (catatan) {
    const existing = (today.catatan as string | null)?.trim();
    updatePayload.catatan = existing ? `${existing} | ${catatan}` : catatan;
  }

  // GPS quality for HR review (0046). Only on the GPS path: a verified QR
  // already proves presence. Added only when there is something to record.
  const gpsAudit: Record<string, unknown> = {};
  if (hasCoords && !qrVerified) {
    if (input.accuracyMeters !== undefined) gpsAudit.akurasi_pulang_meter = input.accuracyMeters;
    const masukAt = today.jam_masuk ? new Date(today.jam_masuk as string) : null;
    const masukPoint = parsePoint(today.lokasi_masuk);
    const flags = locationFlags({
      lat: input.lat as number,
      long: input.long as number,
      accuracyMeters: input.accuracyMeters,
      fixAgeSeconds: input.fixAgeSeconds,
      previous: masukPoint && masukAt && !Number.isNaN(masukAt.getTime()) ? { ...masukPoint, at: masukAt } : null,
      now,
    });
    if (flags.length > 0) gpsAudit.flag_lokasi_pulang = flags;
  }

  const update = (payload: Record<string, unknown>) =>
    db
      .from("attendances")
      .update(payload)
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
  let { data: updated, error: updateErr } = await update({ ...updatePayload, ...gpsAudit });
  // Pre-0046 the audit columns don't exist; never lose a clock-out over them.
  if (isMissingColumn(updateErr) && Object.keys(gpsAudit).length > 0) {
    console.warn("clockOut: kolom akurasi/flag lokasi belum ada — jalankan migrasi 0046.");
    ({ data: updated, error: updateErr } = await update(updatePayload));
  }

  if (updateErr || !updated) {
    // Zero rows matched: another request closed the record between the
    // pre-check and this write. Report it exactly as the pre-check does, so
    // both paths read identically to the user.
    if (updateErr?.code === PGRST_NO_ROWS || (!updateErr && !updated)) {
      console.error("clockOut: lost double clock-out race", {
        attendanceId: today.id,
        employeeId: input.employeeId,
      });
      return { ok: false, error: DUPLICATE_CLOCK_OUT_MESSAGE };
    }
    console.error("clockOut: update failed", updateErr);
    return { ok: false, error: "Gagal menyimpan absen pulang." };
  }

  return { ok: true, status: finalStatus };
}
