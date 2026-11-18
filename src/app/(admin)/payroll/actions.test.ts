import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ rpc, from })),
  createServiceRoleSupabaseClient: vi.fn(() => ({ service: true })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const after = vi.fn();
vi.mock("next/server", () => ({ after: (cb: () => unknown) => after(cb) }));
const notifyPayslipsPublished = vi.fn();
vi.mock("@/lib/payroll/notify-payslips", () => ({
  notifyPayslipsPublished: (...a: unknown[]) => notifyPayslipsPublished(...a),
}));

import { createPayrollPeriod, generatePayroll, finalizePayroll, setPayrollPaid } from "./actions";

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
          return q({ data: [{ id: "s1", branch_id: "b1", department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }], error: null });
        case "holidays":
          return q({ data: [], error: null });
        case "attendances":
          return q({ data: [], error: null });
        case "leave_requests":
          return q({ data: [], error: null });
        case "app_settings":
          return q({ data: { potong_alpa: false, metode_pph21: "tarif_tetap", tarif_pph21_persen: 0 }, error: null });
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
            return q({ data: [{ id: "s1", branch_id: "b1", department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }], error: null });
          case "holidays":
            return q({ data: [{ tanggal: "2026-08-17" }, { tanggal: "2026-08-20" }], error: null });
          case "app_settings":
            return q({ data: { metode_pph21: "tarif_tetap", tarif_pph21_persen: 0 }, error: null });
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
      if (table === "app_settings") return q({ data: { metode_pph21: "tarif_tetap", tarif_pph21_persen: 0 }, error: null });
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

  it("computes each employee against their department's schedule", async () => {
    const sched = { branch_id: "b1", jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15 };
    from.mockImplementation((table: string) => {
      switch (table) {
        case "payroll_periods":
          return q({ data: periodRow(), error: null });
        case "employees":
          return q({
            data: [
              { id: "office", gaji_pokok: 10_000_000, tanggal_mulai_kerja: "2026-01-01", department_id: null },
              { id: "shop", gaji_pokok: 10_000_000, tanggal_mulai_kerja: "2026-01-01", department_id: "d-shop" },
            ],
            error: null,
          });
        case "work_schedules":
          return q({
            data: [
              { ...sched, id: "s1", department_id: null, hari_kerja: [1, 2, 3, 4, 5] },
              { ...sched, id: "s2", department_id: "d-shop", hari_kerja: [1, 2, 3, 4, 5, 6] },
            ],
            error: null,
          });
        case "app_settings":
          return q({ data: { metode_pph21: "tarif_tetap", tarif_pph21_persen: 0 }, error: null });
        default:
          return q({ data: [], error: null });
      }
    });
    rpc.mockResolvedValue({ data: 2, error: null });

    await generatePayroll("p1");
    const rows = rpc.mock.calls[0][1].p_rows as { employee_id: string; rincian_harian: unknown[] }[];
    const days = Object.fromEntries(rows.map((r) => [r.employee_id, r.rincian_harian.length]));
    // August 2026: 21 weekdays; the shop also works its 5 Saturdays.
    expect(days).toEqual({ office: 21, shop: 26 });
  });

  it("refuses to run when an employee has no schedule at all", async () => {
    from.mockImplementation((table: string) => {
      if (table === "payroll_periods") return q({ data: periodRow(), error: null });
      if (table === "app_settings") return q({ data: { metode_pph21: "tarif_tetap", tarif_pph21_persen: 0 }, error: null });
      if (table === "employees")
        return q({ data: [{ id: "e1", gaji_pokok: 1, tanggal_mulai_kerja: null, department_id: "d-x" }], error: null });
      if (table === "work_schedules")
        return q({ data: [{ id: "s2", branch_id: "b1", department_id: "d-other", jam_masuk: "09:00", jam_pulang: "17:00", toleransi_terlambat_menit: 0, hari_kerja: [1] }], error: null });
      return q({ data: [], error: null });
    });
    const result = await generatePayroll("p1");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("belum punya jadwal kerja") });
    expect(rpc).not.toHaveBeenCalled();
  });

  describe("alpa deduction", () => {
    // August 2026, one employee with no attendance at all (21 alpa days).
    function mockBranch(opts: { company: boolean | null; override: boolean | null; overrideError?: boolean }) {
      from.mockImplementation((table: string) => {
        switch (table) {
          case "payroll_periods":
            return q({ data: periodRow(), error: null });
          case "employees":
            // Same table serves the main read and the potong_alpa read.
            return q({
              data: [{ id: "e1", gaji_pokok: 10_500_000, tanggal_mulai_kerja: "2026-01-01", department_id: null, potong_alpa: opts.override }],
              error: opts.overrideError ? { message: "column employees.potong_alpa does not exist" } : null,
            });
          case "work_schedules":
            return q({ data: [{ id: "s1", branch_id: "b1", department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }], error: null });
          case "app_settings":
            // Rate 0 here keeps these assertions about alpa only; PPh 21 has its own tests.
            return q({ data: opts.company === null ? null : { potong_alpa: opts.company, metode_pph21: "tarif_tetap", tarif_pph21_persen: 0 }, error: null });
          default:
            return q({ data: [], error: null });
        }
      });
      rpc.mockResolvedValue({ data: 1, error: null });
    }
    const gajiAkhir = () => rpc.mock.calls[0][1].p_rows[0].gaji_akhir;

    it("pays full salary by default", async () => {
      mockBranch({ company: false, override: null });
      await generatePayroll("p1");
      expect(gajiAkhir()).toBe(10_500_000);
    });

    it("deducts when the company setting is on", async () => {
      mockBranch({ company: true, override: null });
      await generatePayroll("p1");
      expect(gajiAkhir()).toBe(0);
    });

    it("lets an employee override the company setting either way", async () => {
      mockBranch({ company: false, override: true });
      await generatePayroll("p1");
      expect(gajiAkhir()).toBe(0);

      rpc.mockClear();
      mockBranch({ company: true, override: false });
      await generatePayroll("p1");
      expect(gajiAkhir()).toBe(10_500_000);
    });
  });

  describe("PPh 21", () => {
    function mockBranch(appSettings: { data: unknown; error: unknown }) {
      from.mockImplementation((table: string) => {
        switch (table) {
          case "payroll_periods":
            return q({ data: periodRow(), error: null });
          case "employees":
            return q({ data: [{ id: "e1", gaji_pokok: 10_000_000, tanggal_mulai_kerja: "2026-01-01", department_id: null, potong_alpa: null }], error: null });
          case "work_schedules":
            return q({ data: [{ id: "s1", branch_id: "b1", department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }], error: null });
          case "app_settings":
            return q(appSettings);
          default:
            return q({ data: [], error: null });
        }
      });
      rpc.mockResolvedValue({ data: 1, error: null });
    }

    it("withholds the configured rate from the earned wage", async () => {
      mockBranch({ data: { potong_alpa: false, metode_pph21: "tarif_tetap", tarif_pph21_persen: "1.00" }, error: null });
      await generatePayroll("p1");
      expect(rpc.mock.calls[0][1].p_rows[0]).toMatchObject({
        tarif_pph21: 1,
        potongan_pph21: 100_000,
        gaji_akhir: 9_900_000,
      });
    });

    it("stops payroll when the rate cannot be read", async () => {
      mockBranch({ data: null, error: { message: "column app_settings.tarif_pph21_persen does not exist" } });
      const result = await generatePayroll("p1");
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("PPh 21") });
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe("PPh 21 TER and overtime", () => {
    // August 2026; one employee at 10,000,000, on time every weekday, leaving
    // at 19:00 WIB (2h past a 17:00 end) only on 3 Aug.
    function mockBranch(opts: { hitungLembur: boolean; statusPtkp: string }) {
      from.mockImplementation((table: string) => {
        switch (table) {
          case "payroll_periods":
            return q({ data: periodRow(), error: null });
          case "employees":
            return q({
              data: [{ id: "e1", gaji_pokok: 10_000_000, tanggal_mulai_kerja: "2026-01-01", department_id: null, potong_alpa: null, status_ptkp: opts.statusPtkp }],
              error: null,
            });
          case "work_schedules":
            return q({
              data: [{ id: "s1", branch_id: "b1", department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5], hitung_lembur: opts.hitungLembur }],
              error: null,
            });
          case "app_settings":
            return q({ data: { potong_alpa: false, metode_pph21: "ter", tarif_pph21_persen: 1 }, error: null });
          case "pph21_ter_rates":
            return q({
              data: [
                { kategori: "A", batas_bawah: 0, tarif_persen: 0 },
                { kategori: "A", batas_bawah: 9_650_001, tarif_persen: 2 },
                { kategori: "A", batas_bawah: 10_050_001, tarif_persen: 2.25 },
                { kategori: "B", batas_bawah: 0, tarif_persen: 0 },
                { kategori: "B", batas_bawah: 9_200_001, tarif_persen: 1.5 },
                { kategori: "C", batas_bawah: 0, tarif_persen: 0 },
              ],
              error: null,
            });
          case "pph21_ptkp_kategori":
            return q({ data: [{ status_ptkp: "TK/0", kategori: "A" }, { status_ptkp: "K/1", kategori: "B" }], error: null });
          case "attendances": {
            const days = ["03", "04", "05", "06", "07", "10", "11", "12", "13", "14", "17", "18", "19", "20", "21", "24", "25", "26", "27", "28", "31"];
            return q({
              data: days.map((d) => ({
                employee_id: "e1",
                tanggal: `2026-08-${d}`,
                status: "tepat_waktu",
                jam_masuk: `2026-08-${d}T01:55:00Z`,
                jam_pulang: d === "03" ? `2026-08-${d}T12:00:00Z` : `2026-08-${d}T10:00:00Z`,
              })),
              error: null,
            });
          }
          default:
            return q({ data: [], error: null });
        }
      });
      rpc.mockResolvedValue({ data: 1, error: null });
    }
    const row = () => rpc.mock.calls[0][1].p_rows[0];

    it("withholds TER by the employee's PTKP category", async () => {
      mockBranch({ hitungLembur: false, statusPtkp: "K/1" });
      await generatePayroll("p1");
      expect(row()).toMatchObject({ penghasilan_bruto: 10_000_000, kategori_ter: "B", tarif_pph21: 1.5, potongan_pph21: 150_000, gaji_akhir: 9_850_000 });
    });

    it("adds paid overtime to the gross before TER when the schedule pays overtime", async () => {
      mockBranch({ hitungLembur: true, statusPtkp: "TK/0" });
      await generatePayroll("p1");
      // 120 min: 1/173 × 10,000,000 × (1.5 + 2) = 202,312.14
      expect(row()).toMatchObject({ menit_lembur: 120, upah_lembur: 202_312.14, penghasilan_bruto: 10_202_312.14, kategori_ter: "A", tarif_pph21: 2.25 });
    });

    it("pays no overtime when the schedule does not", async () => {
      mockBranch({ hitungLembur: false, statusPtkp: "TK/0" });
      await generatePayroll("p1");
      expect(row()).toMatchObject({ menit_lembur: 0, upah_lembur: 0, tarif_pph21: 2 });
    });
  });

  it("maps a finalized-period RPC error", async () => {
    from.mockImplementation((table: string) => {
      if (table === "payroll_periods") return q({ data: periodRow(), error: null });
      if (table === "work_schedules") return q({ data: [{ id: "s1", branch_id: "b1", department_id: null, jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1] }], error: null });
      if (table === "app_settings") return q({ data: { metode_pph21: "tarif_tetap", tarif_pph21_persen: 0 }, error: null });
      return q({ data: [], error: null });
    });
    rpc.mockResolvedValue({ data: null, error: { message: "payroll period is finalized" } });
    const result = await generatePayroll("p1");
    expect(result).toEqual({ ok: false, error: "Periode ini sudah difinalisasi dan terkunci." });
  });
});

describe("generatePayroll selection", () => {
  it("refuses an empty selection before touching the database", async () => {
    expect(await generatePayroll("p1", [])).toEqual({ ok: false, error: "Pilih minimal satu karyawan." });
    expect(from).not.toHaveBeenCalled();
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

  it("succeeds and emails the payslip notice after the response", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    after.mockReset();
    notifyPayslipsPublished.mockReset();
    const result = await finalizePayroll("p1");
    expect(result).toEqual({ ok: true });
    expect(after).toHaveBeenCalledTimes(1);
    expect(notifyPayslipsPublished).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(notifyPayslipsPublished).toHaveBeenCalledWith({ service: true }, "p1");
  });

  it("does not notify when finalize fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "payroll period is already finalized" } });
    after.mockReset();
    await finalizePayroll("p1");
    expect(after).not.toHaveBeenCalled();
  });
});

describe("setPayrollPaid", () => {
  it("records the payment date through the RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await setPayrollPaid("p1", "2026-11-25");
    expect(rpc).toHaveBeenCalledWith("set_payroll_paid", { p_period_id: "p1", p_tanggal: "2026-11-25" });
    expect(result).toMatchObject({ ok: true });
  });

  it("clears it with null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await setPayrollPaid("p1", null);
    expect(rpc).toHaveBeenCalledWith("set_payroll_paid", { p_period_id: "p1", p_tanggal: null });
  });

  it("rejects a malformed date without calling the database", async () => {
    const result = await setPayrollPaid("p1", "25/11/2026");
    expect(result).toEqual({ ok: false, error: "Tanggal pembayaran tidak valid." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("explains that a draft must be finalized first", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "payroll period is not finalized" } });
    expect(await setPayrollPaid("p1", "2026-11-25")).toEqual({
      ok: false,
      error: "Finalisasi periode ini dulu sebelum menandainya dibayar.",
    });
  });
});
