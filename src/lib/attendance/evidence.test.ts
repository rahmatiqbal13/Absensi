import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadAttendanceEvidence } from "./evidence";
import type { CurrentEmployee } from "@/lib/auth/session";

const EMP_ID = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-11-18T12:00:00Z");
const ROW = {
  status: "tepat_waktu",
  catatan: null,
  jam_masuk: "2026-11-18T01:00:00Z",
  jam_pulang: "2026-11-18T10:00:00Z",
  lokasi_masuk: "(-6.2001,106.8)",
  lokasi_pulang: null,
  foto_masuk_url: `${EMP_ID}/masuk-1.jpg`,
  foto_pulang_url: `${EMP_ID}/pulang-1.jpg`,
  foto_masuk_expires_at: "2027-02-16T00:00:00Z",
  // Past retention, not purged yet: must not be shown.
  foto_pulang_expires_at: "2026-11-01T00:00:00Z",
  metode_masuk: "gps",
  metode_pulang: "qr",
};

function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result);
  return b;
}

function makeDb(opts: { row?: unknown; auditCols?: { data: unknown; error: unknown } } = {}) {
  let attendanceCall = 0;
  const createSignedUrls = vi.fn(async (paths: string[]) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}`, error: null })),
    error: null,
  }));
  const db = {
    from: (t: string) => {
      if (t === "attendances") {
        return attendanceCall++ === 0
          ? q({ data: "row" in opts ? opts.row : ROW, error: null })
          : q(opts.auditCols ?? { data: { akurasi_masuk_meter: 12, akurasi_pulang_meter: null, flag_lokasi_masuk: ["akurasi_rendah", "x"], flag_lokasi_pulang: [] }, error: null });
      }
      if (t === "employees") return q({ data: { branch_id: "b1", department_id: null }, error: null });
      if (t === "branches") return q({ data: { lat: -6.2, long: 106.8, radius_geofencing_meter: 100 }, error: null });
      return q({ data: null, error: null });
    },
    storage: { from: () => ({ createSignedUrls }) },
  };
  const insert = vi.fn(async () => ({ error: null }));
  const service = { from: () => ({ insert }) };
  return { db: db as never, service: service as never, createSignedUrls, insert };
}

const viewer = (role: CurrentEmployee["role"]) =>
  ({ id: "hr-1", nama: "", email: "", role, branchId: "b1", departmentId: null, fotoPath: null }) as CurrentEmployee;

beforeEach(() => vi.restoreAllMocks());

describe("loadAttendanceEvidence", () => {
  it("refuses atasan and karyawan before touching any data", async () => {
    for (const role of ["atasan", "karyawan"] as const) {
      const m = makeDb();
      const res = await loadAttendanceEvidence(m.db, m.service, viewer(role), EMP_ID, "2026-11-18", NOW);
      expect(res.ok).toBe(false);
      expect(m.createSignedUrls).not.toHaveBeenCalled();
      expect(m.insert).not.toHaveBeenCalled();
    }
  });

  it("signs only photos still within retention, for 5 minutes", async () => {
    const m = makeDb();
    const res = await loadAttendanceEvidence(m.db, m.service, viewer("hr_admin"), EMP_ID, "2026-11-18", NOW);
    expect(m.createSignedUrls).toHaveBeenCalledWith([`${EMP_ID}/masuk-1.jpg`], 300);
    if (!res.ok) throw new Error(res.error);
    expect(res.evidence.masuk).toMatchObject({ fotoStatus: "ada", fotoUrl: `https://signed/${EMP_ID}/masuk-1.jpg` });
    expect(res.evidence.pulang).toMatchObject({ fotoStatus: "dihapus", fotoUrl: null });
  });

  it("reports position, distance from the office, accuracy, method and known flags", async () => {
    const m = makeDb();
    const res = await loadAttendanceEvidence(m.db, m.service, viewer("super_admin"), EMP_ID, "2026-11-18", NOW);
    if (!res.ok) throw new Error(res.error);
    expect(res.evidence.kantor).toMatchObject({ lat: -6.2, long: 106.8, radius_geofencing_meter: 100 });
    expect(res.evidence.masuk).toMatchObject({
      metode: "gps",
      lokasi: { lat: -6.2001, lng: 106.8 },
      jarakMeter: 11,
      akurasiMeter: 12,
      flags: ["akurasi_rendah"],
    });
    expect(res.evidence.pulang).toMatchObject({ metode: "qr", lokasi: null, jarakMeter: null });
  });

  it("writes an audit entry for every view", async () => {
    const m = makeDb();
    await loadAttendanceEvidence(m.db, m.service, viewer("hr_admin"), EMP_ID, "2026-11-18", NOW);
    expect(m.insert).toHaveBeenCalledWith({
      actor_id: "hr-1",
      target_employee_id: EMP_ID,
      aksi: "attendance_evidence_viewed",
      detail: { tanggal: "2026-11-18", foto: 1 },
    });
  });

  it("still works before migration 0046 (no accuracy / flags)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = makeDb({ auditCols: { data: null, error: { code: "42703", message: "column does not exist" } } });
    const res = await loadAttendanceEvidence(m.db, m.service, viewer("hr_admin"), EMP_ID, "2026-11-18", NOW);
    if (!res.ok) throw new Error(res.error);
    expect(res.evidence.masuk).toMatchObject({ akurasiMeter: null, flags: [] });
  });

  it("says so when there is no attendance that day", async () => {
    const m = makeDb({ row: null });
    expect(await loadAttendanceEvidence(m.db, m.service, viewer("hr_admin"), EMP_ID, "2026-11-18", NOW)).toEqual({
      ok: false,
      error: "Tidak ada data absen pada tanggal ini.",
    });
  });

  it("rejects malformed input", async () => {
    const m = makeDb();
    expect((await loadAttendanceEvidence(m.db, m.service, viewer("hr_admin"), "nope", "2026-11-18", NOW)).ok).toBe(false);
    expect((await loadAttendanceEvidence(m.db, m.service, viewer("hr_admin"), EMP_ID, "18-11-2026", NOW)).ok).toBe(false);
  });
});
