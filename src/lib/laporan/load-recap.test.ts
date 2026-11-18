import { describe, it, expect, vi } from "vitest";
import { loadRecap } from "./load-recap";

// Thenable query-builder mock (same shape as payroll/actions.test.ts).
function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "in", "is", "order", "limit", "or"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result);
  b.single = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

const FILTERS = { branchId: "11111111-1111-1111-1111-111111111111", from: "2026-08-03", to: "2026-08-07" };

function makeDb(tables: Record<string, unknown>) {
  // work_requests (approved lembur, 0058) defaults to none.
  return { from: vi.fn((t: string) => tables[t] ?? (t === "work_requests" || t === "shift_assignments" ? q({ data: [], error: null }) : undefined)) } as never;
}

describe("loadRecap", () => {
  it("rejects a non-UUID branchId without touching the db", async () => {
    const from = vi.fn();
    const db = { from } as never;
    const result = await loadRecap(db, { ...FILTERS, branchId: "not-a-uuid" });
    expect(result).toEqual({ ok: false, error: "Cabang tidak valid." });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns an error if the branch is not found", async () => {
    const db = makeDb({ branches: q({ data: null, error: null }) });
    const result = await loadRecap(db, FILTERS);
    expect(result).toEqual({ ok: false, error: "Cabang tidak ditemukan." });
  });

  it("returns an error if a data query fails", async () => {
    const db = makeDb({
      branches: q({ data: { nama: "Kantor Pusat" }, error: null }),
      work_schedules: q({ data: null, error: { message: "boom" } }),
      employees: q({ data: [], error: null }),
      holidays: q({ data: [], error: null }),
      attendances: q({ data: [], error: null }),
      leave_requests: q({ data: [], error: null }),
    });
    const result = await loadRecap(db, FILTERS);
    expect(result).toEqual({ ok: false, error: "Gagal memuat data laporan." });
  });

  it("returns an error if the branch has no work schedule", async () => {
    const db = makeDb({
      branches: q({ data: { nama: "Kantor Pusat" }, error: null }),
      work_schedules: q({ data: null, error: null }),
      employees: q({ data: [], error: null }),
      holidays: q({ data: [], error: null }),
      attendances: q({ data: [], error: null }),
      leave_requests: q({ data: [], error: null }),
    });
    const result = await loadRecap(db, FILTERS);
    expect(result).toEqual({ ok: false, error: "Cabang ini belum punya jadwal kerja." });
  });

  it("computes a recap for a happy path", async () => {
    const db = makeDb({
      branches: q({ data: { nama: "Kantor Pusat" }, error: null }),
      work_schedules: q({ data: [{ id: "s1", branch_id: FILTERS.branchId, department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }], error: null }),
      employees: q({ data: [{ id: "e1", nama: "Budi", tanggal_mulai_kerja: "2026-01-01" }], error: null }),
      holidays: q({ data: [], error: null }),
      attendances: q({ data: [{ employee_id: "e1", tanggal: "2026-08-03", status: "tepat_waktu", jam_masuk: "2026-08-03T02:00:00Z" }], error: null }),
      leave_requests: q({ data: [], error: null }),
    });
    const result = await loadRecap(db, FILTERS);
    expect(result).toMatchObject({ ok: true, branchNama: "Kantor Pusat" });
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ nama: "Budi", hadir: 1, alpa: 4, hariKerjaEfektif: 5 });
  });

  it("applies each employee's department schedule and keeps name order", async () => {
    const base = { branch_id: FILTERS.branchId, jam_pulang: "17:00:00", toleransi_terlambat_menit: 0 };
    const db = makeDb({
      branches: q({ data: { nama: "Kantor Pusat" }, error: null }),
      work_schedules: q({
        data: [
          { ...base, id: "s1", department_id: null, jam_masuk: "09:00:00", hari_kerja: [1, 2, 3, 4, 5] },
          // Warehouse starts at 07:00 and also works Saturday (not in this range).
          { ...base, id: "s2", department_id: "gudang", jam_masuk: "07:00:00", hari_kerja: [1, 2, 3] },
        ],
        error: null,
      }),
      employees: q({
        data: [
          { id: "e1", nama: "Ani", tanggal_mulai_kerja: "2026-01-01", department_id: "gudang" },
          { id: "e2", nama: "Budi", tanggal_mulai_kerja: "2026-01-01", department_id: null },
        ],
        error: null,
      }),
      holidays: q({ data: [], error: null }),
      attendances: q({
        data: [
          // 08:00 WIB: an hour late against the warehouse's own 07:00 start.
          { employee_id: "e1", tanggal: "2026-08-03", status: "terlambat", jam_masuk: "2026-08-03T01:00:00Z" },
          { employee_id: "e2", tanggal: "2026-08-03", status: "tepat_waktu", jam_masuk: "2026-08-03T01:00:00Z" },
        ],
        error: null,
      }),
      leave_requests: q({ data: [], error: null }),
    });
    const result = await loadRecap(db, FILTERS);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.map((r) => r.nama)).toEqual(["Ani", "Budi"]);
    expect(result.rows[0]).toMatchObject({ hariKerjaEfektif: 3, terlambat: 1, totalMenitTerlambat: 60 });
    expect(result.rows[1]).toMatchObject({ hariKerjaEfektif: 5, hadir: 1 });
  });
});

describe("loadRecap — atasan team scope", () => {
  it("filters employees to the atasan's direct reports", async () => {
    const eqCalls: [string, unknown][] = [];
    const employees: Record<string, unknown> = {};
    for (const m of ["select", "gte", "lte", "in", "is", "order", "limit", "or"]) employees[m] = () => employees;
    employees.eq = (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return employees;
    };
    employees.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    const db = makeDb({
      branches: q({ data: { nama: "Kantor Pusat" }, error: null }),
      work_schedules: q({ data: [{ id: "s1", branch_id: FILTERS.branchId, department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 0, hari_kerja: [1] }], error: null }),
      employees,
      holidays: q({ data: [], error: null }),
    });
    const result = await loadRecap(db, { ...FILTERS, atasanId: "atasan-1" });
    expect(result).toMatchObject({ ok: true, rows: [] });
    expect(eqCalls).toContainEqual(["atasan_id", "atasan-1"]);
  });
});
