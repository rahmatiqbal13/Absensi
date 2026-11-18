import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentEmployee } from "@/lib/auth/session";
import { haversineDistanceMeters } from "./geofencing";
import { loadOfficeLocation, type OfficeLocation } from "./office-location";
import { isLocationFlag, parsePoint, type LocationFlag } from "./location-flags";
import { logOptionalLookup } from "@/lib/supabase/missing-column";

/**
 * Everything HR needs to check one attendance day: selfies, where each submit
 * was made relative to the office geofence, and how. Selfies are biometric
 * data (UU PDP): HR admin / super admin only (matching the attendance-photos
 * storage policy), short-lived signed URLs, and every view is audit-logged.
 */
export type EvidenceSide = {
  jam: string | null;
  metode: "gps" | "qr" | null;
  lokasi: { lat: number; lng: number } | null;
  jarakMeter: number | null;
  akurasiMeter: number | null;
  flags: LocationFlag[];
  /** Signed URL valid for PHOTO_URL_TTL_SECONDS; null when there is none. */
  fotoUrl: string | null;
  /**
   * ada = shown; dihapus = past the 90-day retention; gagal = exists but the
   * link could not be made; tidak_ada = no submit for this half of the day.
   */
  fotoStatus: "ada" | "dihapus" | "gagal" | "tidak_ada";
};

export type AttendanceEvidence = {
  tanggal: string;
  status: string;
  catatan: string | null;
  kantor: OfficeLocation | null;
  masuk: EvidenceSide;
  pulang: EvidenceSide;
};

export type EvidenceResult = { ok: true; evidence: AttendanceEvidence } | { ok: false; error: string };

export const PHOTO_URL_TTL_SECONDS = 300;
const BUCKET = "attendance-photos";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  status: string;
  catatan: string | null;
  jam_masuk: string | null;
  jam_pulang: string | null;
  lokasi_masuk: string | null;
  lokasi_pulang: string | null;
  foto_masuk_url: string | null;
  foto_pulang_url: string | null;
  foto_masuk_expires_at: string | null;
  foto_pulang_expires_at: string | null;
  metode_masuk?: string | null;
  metode_pulang?: string | null;
};
type AuditCols = {
  akurasi_masuk_meter: number | null;
  akurasi_pulang_meter: number | null;
  flag_lokasi_masuk: string[] | null;
  flag_lokasi_pulang: string[] | null;
};

/**
 * `db` is the viewer's own client (RLS + storage policy apply); `service` is
 * used only to write the audit entry.
 */
export async function loadAttendanceEvidence(
  db: SupabaseClient,
  service: SupabaseClient,
  viewer: CurrentEmployee,
  employeeId: string,
  tanggal: string,
  now = new Date(),
): Promise<EvidenceResult> {
  if (viewer.role !== "hr_admin" && viewer.role !== "super_admin") {
    return { ok: false, error: "Hanya HR yang dapat melihat foto dan lokasi absen." };
  }
  if (!UUID_RE.test(employeeId) || !DATE_RE.test(tanggal)) return { ok: false, error: "Data tidak valid." };

  const base =
    "status, catatan, jam_masuk, jam_pulang, lokasi_masuk, lokasi_pulang, " +
    "foto_masuk_url, foto_pulang_url, foto_masuk_expires_at, foto_pulang_expires_at, metode_masuk, metode_pulang";
  const [attRes, auditRes, empRes] = await Promise.all([
    db.from("attendances").select(base).eq("employee_id", employeeId).eq("tanggal", tanggal).maybeSingle(),
    // 0046 columns in their own query: missing columns just mean "no data".
    db
      .from("attendances")
      .select("akurasi_masuk_meter, akurasi_pulang_meter, flag_lokasi_masuk, flag_lokasi_pulang")
      .eq("employee_id", employeeId)
      .eq("tanggal", tanggal)
      .maybeSingle(),
    db.from("employees").select("branch_id, department_id").eq("id", employeeId).maybeSingle(),
  ]);
  if (attRes.error || empRes.error) {
    console.error("loadAttendanceEvidence: lookup failed", attRes.error ?? empRes.error);
    return { ok: false, error: "Gagal memuat detail absen." };
  }
  if (!attRes.data) return { ok: false, error: "Tidak ada data absen pada tanggal ini." };
  if (auditRes.error) logOptionalLookup("loadAttendanceEvidence: akurasi/flag", auditRes.error, "0046");

  const row = attRes.data as unknown as Row;
  const extra = (auditRes.error ? null : auditRes.data) as AuditCols | null;

  let kantor: OfficeLocation | null = null;
  const emp = empRes.data as { branch_id: string; department_id: string | null } | null;
  if (emp) {
    const { data: branch } = await db
      .from("branches")
      .select("lat, long, radius_geofencing_meter")
      .eq("id", emp.branch_id)
      .maybeSingle();
    if (branch) {
      kantor = await loadOfficeLocation(db, branch, emp.branch_id, emp.department_id);
      // (0,0) = office point never set.
      if (kantor.lat === 0 && kantor.long === 0) kantor = null;
    }
  }

  // Sign only photos that still exist (the 90-day purge deletes the object and
  // nulls the path; expires_at covers the gap before the nightly run).
  const live = (path: string | null, expires: string | null) =>
    path && (!expires || Date.parse(expires) > now.getTime()) ? path : null;
  const paths = [live(row.foto_masuk_url, row.foto_masuk_expires_at), live(row.foto_pulang_url, row.foto_pulang_expires_at)];
  const signed = new Map<string, string>();
  const toSign = paths.filter((p): p is string => !!p);
  if (toSign.length > 0) {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrls(toSign, PHOTO_URL_TTL_SECONDS);
    if (error) console.error("loadAttendanceEvidence: signing failed", error);
    for (const d of data ?? []) if (!d.error && d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }

  const side = (
    jam: string | null,
    lokasiRaw: string | null,
    metode: string | null | undefined,
    akurasi: number | null | undefined,
    flags: string[] | null | undefined,
    livePath: string | null,
  ): EvidenceSide => {
    const p = parsePoint(lokasiRaw);
    const lokasi = p ? { lat: p.lat, lng: p.long } : null;
    const fotoUrl = livePath ? signed.get(livePath) ?? null : null;
    const fotoStatus = !jam ? "tidak_ada" : fotoUrl ? "ada" : livePath ? "gagal" : "dihapus";
    return {
      jam,
      metode: metode === "gps" || metode === "qr" ? metode : null,
      lokasi,
      jarakMeter: lokasi && kantor ? Math.round(haversineDistanceMeters(kantor.lat, kantor.long, lokasi.lat, lokasi.lng)) : null,
      akurasiMeter: akurasi ?? null,
      flags: (flags ?? []).filter(isLocationFlag),
      fotoUrl,
      fotoStatus,
    };
  };

  const evidence: AttendanceEvidence = {
    tanggal,
    status: row.status,
    catatan: row.catatan,
    kantor,
    masuk: side(row.jam_masuk, row.lokasi_masuk, row.metode_masuk, extra?.akurasi_masuk_meter, extra?.flag_lokasi_masuk, paths[0]),
    pulang: side(row.jam_pulang, row.lokasi_pulang, row.metode_pulang, extra?.akurasi_pulang_meter, extra?.flag_lokasi_pulang, paths[1]),
  };

  const { error: auditErr } = await service.from("audit_logs").insert({
    actor_id: viewer.id,
    target_employee_id: employeeId,
    aksi: "attendance_evidence_viewed",
    detail: { tanggal, foto: toSign.length },
  });
  if (auditErr) console.error("loadAttendanceEvidence: audit insert failed", auditErr);

  return { ok: true, evidence };
}
