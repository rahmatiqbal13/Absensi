import { describe, it, expect, vi } from "vitest";
import { loadEmployeeDailyReport } from "./load-employee-daily";
import type { CurrentEmployee } from "@/lib/auth/session";

const EMP_ID = "11111111-1111-1111-1111-111111111111";
const EMP = {
  id: EMP_ID, nama: "Budi", jabatan: "Staf", branch_id: "b1", department_id: null,
  atasan_id: "atasan-1", tanggal_mulai_kerja: "2025-01-01", branches: { nama: "Pusat" }, departments: null,
};

function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "in", "or", "order"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

function db(employee: unknown) {
  return {
    from: vi.fn((t: string) => {
      if (t === "employees") return q({ data: employee, error: null });
      if (t === "work_schedules")
        return q({ data: [{ branch_id: "b1", department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5], hitung_lembur: false }], error: null });
      return q({ data: [], error: null });
    }),
  } as never;
}
const viewer = (role: CurrentEmployee["role"], id = "x") =>
  ({ id, nama: "", email: "", role, branchId: "b1", departmentId: null, fotoPath: null }) as CurrentEmployee;

describe("loadEmployeeDailyReport access", () => {
  it("lets HR open any employee", async () => {
    const res = await loadEmployeeDailyReport(db(EMP), viewer("hr_admin"), EMP_ID, "2026-08-03", "2026-08-04");
    expect(res).toMatchObject({ ok: true, report: { employee: { nama: "Budi", cabang: "Pusat" }, schedule: { jamMasuk: "09:00" } } });
    if (res.ok) expect(res.report.rows.map((r) => r.kind)).toEqual(["alpa", "alpa"]);
  });

  it("lets an atasan open their own direct report only", async () => {
    expect(await loadEmployeeDailyReport(db(EMP), viewer("atasan", "atasan-1"), EMP_ID, "2026-08-03", "2026-08-03")).toMatchObject({ ok: true });
    expect(await loadEmployeeDailyReport(db(EMP), viewer("atasan", "atasan-2"), EMP_ID, "2026-08-03", "2026-08-03")).toMatchObject({ ok: false, status: 404 });
  });

  it("rejects a malformed id without querying", async () => {
    const d = db(EMP);
    expect(await loadEmployeeDailyReport(d, viewer("hr_admin"), "nope", "2026-08-03", "2026-08-03")).toMatchObject({ ok: false, status: 404 });
  });
});

describe("loadEmployeeDailyReport GPS warnings (0046)", () => {
  const ATT = { tanggal: "2026-08-03", status: "tepat_waktu", jam_masuk: "2026-08-03T01:55:00Z", jam_pulang: null, catatan: null };

  function dbWithFlags(flagResult: unknown) {
    let attendanceCall = 0;
    return {
      from: vi.fn((t: string) => {
        if (t === "employees") return q({ data: EMP, error: null });
        if (t === "work_schedules")
          return q({ data: [{ branch_id: "b1", department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5], hitung_lembur: false }], error: null });
        if (t === "attendances") return q(attendanceCall++ === 0 ? { data: [ATT], error: null } : flagResult);
        return q({ data: [], error: null });
      }),
    } as never;
  }

  it("merges clock-in and clock-out warnings onto the day", async () => {
    const res = await loadEmployeeDailyReport(
      dbWithFlags({
        data: [{ tanggal: "2026-08-03", flag_lokasi_masuk: ["akurasi_rendah"], flag_lokasi_pulang: ["akurasi_rendah", "lompatan_lokasi"] }],
        error: null,
      }),
      viewer("hr_admin"), EMP_ID, "2026-08-03", "2026-08-03",
    );
    expect(res.ok && res.report.rows[0].flagLokasi).toEqual(["akurasi_rendah", "lompatan_lokasi"]);
  });

  it("shows the report without warnings before the migration is applied", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await loadEmployeeDailyReport(
      dbWithFlags({ data: null, error: { code: "42703", message: "column attendances.flag_lokasi_masuk does not exist" } }),
      viewer("hr_admin"), EMP_ID, "2026-08-03", "2026-08-03",
    );
    expect(res.ok && res.report.rows[0]).toMatchObject({ kind: "hadir", flagLokasi: [] });
    warn.mockRestore();
  });
});
