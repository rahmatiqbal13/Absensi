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
  return { from: vi.fn((t: string) => tables[t]) } as never;
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
      work_schedules: q({ data: { jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }, error: null }),
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
});
