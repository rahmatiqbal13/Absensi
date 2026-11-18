import { describe, it, expect, vi } from "vitest";
import { summarizeRincian, deductionLines, earningLines, totalPenerimaan, formatDurasi, loadPayslipDetail, type PayslipDetail } from "./payslip-detail";
import type { RincianHarianEntry } from "./deduction";
import type { CurrentEmployee } from "@/lib/auth/session";

const day = (o: Partial<RincianHarianEntry>): RincianHarianEntry => ({
  tanggal: "2026-08-03", jenis: "kerja", status: "tepat_waktu", menit_terlambat: 0, menit_pulang_cepat: 0, potongan: 0, ...o,
});

describe("summarizeRincian", () => {
  it("counts days by kind and splits the deductions", () => {
    const s = summarizeRincian([
      day({}),
      day({ status: "terlambat", menit_terlambat: 20, potongan: 10_000 }),
      day({ jenis: "luar_kantor", status: "di_luar_lokasi" }),
      day({ menit_pulang_cepat: 15, potongan: 5_000 }),
      day({ jenis: "alpa", status: "alpa", potongan: 200_000 }),
      day({ jenis: "cuti", status: null }),
    ]);
    expect(s).toEqual({
      hariDinilai: 6, hadir: 4, terlambat: 1, pulangCepat: 1, luarKantor: 1, alpa: 1, cuti: 1,
      menitTerlambat: 20, menitPulangCepat: 15, potonganAlpa: 200_000, potonganKeterlambatan: 15_000,
    });
  });
});

const baseSlip = (o: Partial<PayslipDetail> = {}): PayslipDetail => ({
  id: "s1",
  periode: { bulan: 8, tahun: 2026, label: "Agustus 2026", status: "final" },
  karyawan: { nama: "A", jabatan: "-", email: "-", departemen: null, cabang: "-", statusKontrak: "-", tanggalMulaiKerja: null, kontrak: null, masaKerja: null },
  gajiPokok: 1_000_000, hariKerjaEfektif: 20, gajiHarian: 50_000, totalPotonganAbsensi: 50_000,
  menitLembur: 0, upahLembur: 0, kategoriTer: null,
  tarifPph21: 1, potonganPph21: 9_500, gajiAkhir: 940_500,
  ringkasan: summarizeRincian([day({ jenis: "alpa", status: "alpa", potongan: 50_000 })]),
  ...o,
});

describe("deductionLines", () => {
  it("lists alpa, lateness and PPh 21", () => {
    expect(deductionLines(baseSlip())).toEqual([
      { label: "Alpa (1 hari)", amount: 50_000 },
      { label: "Keterlambatan / pulang cepat", amount: 0 },
      { label: "PPh 21 (1%)", amount: 9_500 },
    ]);
  });

  it("falls back to the stored total when the daily breakdown does not add up", () => {
    const lines = deductionLines(baseSlip({ totalPotonganAbsensi: 75_000, tarifPph21: 0, potonganPph21: 0 }));
    expect(lines).toEqual([{ label: "Potongan absensi", amount: 75_000 }]);
  });
});

describe("earnings with overtime and TER label", () => {
  it("adds an overtime line, a TER-labelled tax line, and totals gross earnings", () => {
    const slip = baseSlip({ menitLembur: 135, upahLembur: 150_000, kategoriTer: "A", tarifPph21: 1.25 });
    expect(earningLines(slip)).toEqual([
      { label: "Gaji pokok", amount: 1_000_000 },
      { label: "Lembur (2 jam 15 menit)", amount: 150_000 },
    ]);
    expect(totalPenerimaan(slip)).toBe(1_150_000);
    expect(deductionLines(slip).at(-1)?.label).toBe("PPh 21 (TER A · 1,25%)");
    expect(formatDurasi(45)).toBe("45 menit");
  });
});

describe("loadPayslipDetail access", () => {
  const row = (status: "draft" | "final", employeeId = "emp-1") => ({
    id: "11111111-1111-1111-1111-111111111111",
    employee_id: employeeId,
    gaji_pokok: "1000000", hari_kerja_efektif: 20, gaji_harian: "50000", total_potongan_absensi: "0",
    tarif_pph21: "1.00", potongan_pph21: "10000", gaji_akhir: "990000", rincian_harian: [],
    employees: { nama: "A", jabatan: "Staf", email: "a@x", status_kontrak: "PKWT", tanggal_mulai_kerja: null, departments: null },
    payroll_periods: { bulan: 8, tahun: 2026, status, branches: { nama: "Pusat" } },
  });
  const db = (data: unknown) => {
    const q: Record<string, unknown> = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.maybeSingle = () => Promise.resolve({ data, error: null });
    return { from: () => q } as never;
  };
  const viewer = (role: CurrentEmployee["role"], id = "emp-1") =>
    ({ id, nama: "", email: "", role, branchId: "b", departmentId: null, fotoPath: null }) as CurrentEmployee;
  const ID = "11111111-1111-1111-1111-111111111111";

  it("shows an employee their own finalized slip", async () => {
    const res = await loadPayslipDetail(db(row("final")), viewer("karyawan"), ID);
    expect(res).toMatchObject({ ok: true, slip: { tarifPph21: 1, gajiAkhir: 990_000, karyawan: { cabang: "Pusat" } } });
  });

  it("hides a draft from the employee", async () => {
    expect(await loadPayslipDetail(db(row("draft")), viewer("karyawan"), ID)).toMatchObject({ ok: false, status: 404 });
  });

  it("hides someone else's slip from an atasan", async () => {
    expect(await loadPayslipDetail(db(row("final", "other")), viewer("atasan"), ID)).toMatchObject({ ok: false, status: 404 });
  });

  it("lets HR open any slip, draft included", async () => {
    expect(await loadPayslipDetail(db(row("draft", "other")), viewer("hr_admin", "hr"), ID)).toMatchObject({ ok: true });
  });

  it("rejects a malformed id without querying", async () => {
    expect(await loadPayslipDetail(db(null), viewer("hr_admin"), "nope")).toMatchObject({ ok: false, status: 404 });
  });

  it("shows the contract in force and masa kerja as of the period's last day", async () => {
    const slipRow = {
      ...row("final"),
      employees: { nama: "Rahmat", jabatan: "Staf", email: "r@x", status_kontrak: "PKWT", tanggal_mulai_kerja: "2023-07-17", departments: null },
    };
    const contracts = [
      { id: "k1", jenis: "pkwt", tanggal_mulai: "2023-07-17", tanggal_selesai: "2023-12-31", catatan: null },
      { id: "k2", jenis: "pkwt", tanggal_mulai: "2024-01-01", tanggal_selesai: "2024-12-31", catatan: null },
      { id: "k3", jenis: "pkwt", tanggal_mulai: "2025-01-01", tanggal_selesai: "2025-12-31", catatan: null },
      { id: "k4", jenis: "pkwt", tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-12-31", catatan: null },
    ];
    const tables = {
      from: (t: string) => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.maybeSingle = () => Promise.resolve({ data: slipRow, error: null });
        if (t === "employee_contracts") q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: contracts, error: null }).then(r);
        return q;
      },
    } as never;
    const res = await loadPayslipDetail(tables, viewer("karyawan"), ID);
    // Period is Agustus 2026 -> as of 31 Aug 2026.
    expect(res).toMatchObject({
      ok: true,
      slip: {
        karyawan: {
          kontrak: { status: "PKWT ke-4", periode: "1 Januari 2026 – 31 Desember 2026" },
          masaKerja: "3 tahun 1 bulan",
        },
      },
    });
  });
});
