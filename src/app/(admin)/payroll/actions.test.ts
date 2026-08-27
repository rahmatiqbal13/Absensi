import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ rpc, from })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createPayrollPeriod, generatePayroll, finalizePayroll } from "./actions";

function periodRow() {
  return { id: "p1", branch_id: "b1", bulan: 8, tahun: 2026, status: "draft" };
}

// A thenable query builder whose terminal awaits resolve to `result`.
function q(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "insert", "eq", "gte", "lte", "in", "is", "or", "order", "limit"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe("generatePayroll", () => {
  it("computes payslips and calls generate_payroll with rows", async () => {
    from.mockImplementation((table: string) => {
      switch (table) {
        case "payroll_periods":
          return q({ data: periodRow(), error: null });
        case "employees":
          return q({ data: [{ id: "e1", gaji_pokok: 10_500_000, tanggal_mulai_kerja: "2026-01-01" }], error: null });
        case "work_schedules":
          return q({ data: { jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }, error: null });
        case "holidays":
          return q({ data: [], error: null });
        case "attendances":
          return q({ data: [], error: null });
        case "leave_requests":
          return q({ data: [], error: null });
        default:
          throw new Error(`unexpected table ${table}`);
      }
    });
    rpc.mockResolvedValue({ data: 1, error: null });

    const result = await generatePayroll("p1");
    expect(result).toEqual({ ok: true, message: "1 slip gaji dibuat." });
    expect(rpc).toHaveBeenCalledWith("generate_payroll", expect.objectContaining({ p_period_id: "p1" }));
    const rows = rpc.mock.calls[0][1].p_rows;
    expect(rows[0].employee_id).toBe("e1");
    expect(rows[0].gaji_harian).toBe(500_000);
  });

  it("branch-scopes the holidays lookup (national OR this branch)", async () => {
    let holidaysBuilder: Record<string, ReturnType<typeof vi.fn>> | undefined;
    from.mockImplementation((table: string) => {
      const b = (() => {
        switch (table) {
          case "payroll_periods":
            return q({ data: periodRow(), error: null });
          case "employees":
            return q({ data: [{ id: "e1", gaji_pokok: 10_500_000, tanggal_mulai_kerja: "2026-01-01" }], error: null });
          case "work_schedules":
            return q({ data: { jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }, error: null });
          case "holidays":
            return q({ data: [{ tanggal: "2026-08-17" }, { tanggal: "2026-08-20" }], error: null });
          default:
            return q({ data: [], error: null });
        }
      })();
      if (table === "holidays") holidaysBuilder = b as never;
      return b;
    });
    rpc.mockResolvedValue({ data: 1, error: null });

    await generatePayroll("p1");
    expect(holidaysBuilder?.or).toHaveBeenCalledWith("branch_id.is.null,branch_id.eq.b1");
  });

  it("returns a fixed Indonesian message when a reference-data lookup errors", async () => {
    from.mockImplementation((table: string) => {
      if (table === "payroll_periods") return q({ data: periodRow(), error: null });
      if (table === "employees") return q({ data: null, error: { message: "boom" } });
      return q({ data: [], error: null });
    });
    const result = await generatePayroll("p1");
    expect(result).toEqual({ ok: false, error: "Gagal memuat data untuk payroll." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the schedule-missing message when work_schedules has no row", async () => {
    from.mockImplementation((table: string) => {
      if (table === "payroll_periods") return q({ data: periodRow(), error: null });
      if (table === "work_schedules") return q({ data: null, error: null });
      return q({ data: [], error: null });
    });
    const result = await generatePayroll("p1");
    expect(result).toEqual({ ok: false, error: "Cabang ini belum punya jadwal kerja." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns period-not-found when the period lookup yields no row", async () => {
    from.mockImplementation((table: string) => {
      if (table === "payroll_periods") return q({ data: null, error: null });
      return q({ data: [], error: null });
    });
    const result = await generatePayroll("missing");
    expect(result).toEqual({ ok: false, error: "Periode payroll tidak ditemukan." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a finalized-period RPC error", async () => {
    from.mockImplementation((table: string) => {
      if (table === "payroll_periods") return q({ data: periodRow(), error: null });
      if (table === "work_schedules") return q({ data: { jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1] }, error: null });
      return q({ data: [], error: null });
    });
    rpc.mockResolvedValue({ data: null, error: { message: "payroll period is finalized" } });
    const result = await generatePayroll("p1");
    expect(result).toEqual({ ok: false, error: "Periode ini sudah difinalisasi dan terkunci." });
  });
});

describe("createPayrollPeriod", () => {
  it("inserts the period and returns ok", async () => {
    from.mockImplementation(() => q({ data: null, error: null }));
    const result = await createPayrollPeriod("b1", 8, 2026);
    expect(result).toEqual({ ok: true });
  });

  it("maps a 23505 unique violation to the 'sudah ada' message", async () => {
    from.mockImplementation(() => q({ data: null, error: { code: "23505", message: "duplicate key value" } }));
    const result = await createPayrollPeriod("b1", 8, 2026);
    expect(result).toEqual({ ok: false, error: "Periode payroll untuk cabang dan bulan ini sudah ada." });
  });

  it("returns a fixed message on a generic insert error", async () => {
    from.mockImplementation(() => q({ data: null, error: { code: "42501", message: "permission denied" } }));
    const result = await createPayrollPeriod("b1", 8, 2026);
    expect(result).toEqual({ ok: false, error: "Gagal membuat periode payroll." });
  });
});

describe("finalizePayroll", () => {
  it("maps the empty-period error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "cannot finalize a payroll period with no payslips" } });
    const result = await finalizePayroll("p1");
    expect(result).toEqual({ ok: false, error: "Tidak dapat memfinalisasi periode tanpa slip gaji." });
  });

  it("succeeds", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await finalizePayroll("p1");
    expect(result).toEqual({ ok: true });
  });
});
