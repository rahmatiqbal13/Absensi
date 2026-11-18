import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentEmployee } from "@/lib/auth/session";
import type { RincianHarianEntry } from "./deduction";
import { round2 } from "./round";
import { formatPersen } from "./pph21";
import { monthLabel } from "@/lib/format/month";
import { isMissingColumn, logOptionalLookup } from "@/lib/supabase/missing-column";

/** Everything a payslip shows — shared by the web view and the PDF. */
export type PayslipDetail = {
  id: string;
  periode: { bulan: number; tahun: number; label: string; status: "draft" | "final"; dibayarPada?: string | null };
  karyawan: {
    nama: string;
    jabatan: string;
    email: string;
    departemen: string | null;
    cabang: string;
    statusKontrak: string;
    tanggalMulaiKerja: string | null;
  };
  gajiPokok: number;
  hariKerjaEfektif: number;
  gajiHarian: number;
  totalPotonganAbsensi: number;
  menitLembur: number;
  upahLembur: number;
  tarifPph21: number;
  /** TER category (A/B/C), null under the flat-rate method. */
  kategoriTer: string | null;
  potonganPph21: number;
  gajiAkhir: number;
  ringkasan: PayslipSummary;
};

export type PayslipSummary = {
  /** Working days assessed this period (post-join). */
  hariDinilai: number;
  hadir: number;
  terlambat: number;
  pulangCepat: number;
  luarKantor: number;
  alpa: number;
  cuti: number;
  menitTerlambat: number;
  menitPulangCepat: number;
  /** Wage deducted for alpa days (0 when alpa is not deducted). */
  potonganAlpa: number;
  /** Late / early-leave fines. */
  potonganKeterlambatan: number;
};

export function summarizeRincian(rincian: readonly RincianHarianEntry[]): PayslipSummary {
  const s: PayslipSummary = {
    hariDinilai: rincian.length,
    hadir: 0,
    terlambat: 0,
    pulangCepat: 0,
    luarKantor: 0,
    alpa: 0,
    cuti: 0,
    menitTerlambat: 0,
    menitPulangCepat: 0,
    potonganAlpa: 0,
    potonganKeterlambatan: 0,
  };
  for (const r of rincian) {
    s.menitTerlambat += r.menit_terlambat ?? 0;
    s.menitPulangCepat += r.menit_pulang_cepat ?? 0;
    if (r.jenis === "alpa") {
      s.alpa += 1;
      s.potonganAlpa += r.potongan;
    } else if (r.jenis === "cuti") {
      s.cuti += 1;
    } else {
      // "kerja" and "luar_kantor" are both days the employee showed up.
      s.hadir += 1;
      if (r.jenis === "luar_kantor") s.luarKantor += 1;
      if ((r.menit_terlambat ?? 0) > 0) s.terlambat += 1;
      if ((r.menit_pulang_cepat ?? 0) > 0) s.pulangCepat += 1;
      s.potonganKeterlambatan += r.potongan;
    }
  }
  s.potonganAlpa = round2(s.potonganAlpa);
  s.potonganKeterlambatan = round2(s.potonganKeterlambatan);
  return s;
}

type Row = {
  id: string;
  employee_id: string;
  gaji_pokok: number | string;
  hari_kerja_efektif: number;
  gaji_harian: number | string;
  total_potongan_absensi: number | string;
  tarif_pph21: number | string | null;
  kategori_ter: string | null;
  menit_lembur: number | null;
  upah_lembur: number | string | null;
  potongan_pph21: number | string | null;
  gaji_akhir: number | string;
  rincian_harian: RincianHarianEntry[] | null;
  employees: {
    nama: string;
    jabatan: string;
    email: string;
    status_kontrak: string;
    tanggal_mulai_kerja: string | null;
    departments: { nama: string } | null;
  } | null;
  payroll_periods: {
    bulan: number;
    tahun: number;
    status: "draft" | "final";
    dibayar_pada?: string | null;
    branches: { nama: string } | null;
  } | null;
};

export type LoadPayslipResult =
  | { ok: true; slip: PayslipDetail }
  | { ok: false; status: 403 | 404 | 500; error: string };

const PAYROLL_ROLES = new Set(["hr_admin", "super_admin"]);

/**
 * Loads one payslip for `viewer`. HR / super admins may open any payslip; an
 * employee only their own, and only once the period is finalized (a draft can
 * still change). RLS alone would also let `atasan` read everyone's salary.
 */
export async function loadPayslipDetail(
  db: SupabaseClient,
  viewer: CurrentEmployee,
  payslipId: string,
): Promise<LoadPayslipResult> {
  if (!/^[0-9a-f-]{36}$/i.test(payslipId)) return { ok: false, status: 404, error: "Slip gaji tidak ditemukan." };

  const select = (extra: string) =>
    db
      .from("payslips")
      .select(
        "id, employee_id, gaji_pokok, hari_kerja_efektif, gaji_harian, total_potongan_absensi, tarif_pph21, " +
          extra +
          "potongan_pph21, gaji_akhir, rincian_harian, " +
          "employees(nama, jabatan, email, status_kontrak, tanggal_mulai_kerja, departments(nama)), " +
          "payroll_periods(bulan, tahun, status, dibayar_pada, branches(nama))",
      )
      .eq("id", payslipId)
      .maybeSingle();
  let { data, error } = await select("kategori_ter, menit_lembur, upah_lembur, ");
  // Before migration 0039 these columns don't exist; read the slip without them.
  if (error && isMissingColumn(error)) {
    logOptionalLookup("loadPayslipDetail: kolom lembur/TER", error, "0039");
    ({ data, error } = await select(""));
  }
  if (error) {
    console.error("loadPayslipDetail: query failed", error);
    return { ok: false, status: 500, error: "Gagal memuat slip gaji." };
  }
  if (!data) return { ok: false, status: 404, error: "Slip gaji tidak ditemukan." };

  const row = data as unknown as Row;
  const isPayrollAdmin = PAYROLL_ROLES.has(viewer.role);
  const isOwnFinal = row.employee_id === viewer.id && row.payroll_periods?.status === "final";
  if (!isPayrollAdmin && !isOwnFinal) {
    // Same answer as "missing": don't confirm that someone else's slip exists.
    return { ok: false, status: 404, error: "Slip gaji tidak ditemukan." };
  }

  const period = row.payroll_periods;
  const emp = row.employees;
  const rincian = row.rincian_harian ?? [];
  return {
    ok: true,
    slip: {
      id: row.id,
      periode: {
        bulan: period?.bulan ?? 0,
        tahun: period?.tahun ?? 0,
        label: period ? `${monthLabel(period.bulan)} ${period.tahun}` : "-",
        status: period?.status ?? "draft",
        dibayarPada: period?.dibayar_pada ?? null,
      },
      karyawan: {
        nama: emp?.nama ?? "-",
        jabatan: emp?.jabatan ?? "-",
        email: emp?.email ?? "-",
        departemen: emp?.departments?.nama ?? null,
        cabang: period?.branches?.nama ?? "-",
        statusKontrak: emp?.status_kontrak ?? "-",
        tanggalMulaiKerja: emp?.tanggal_mulai_kerja ?? null,
      },
      gajiPokok: Number(row.gaji_pokok),
      hariKerjaEfektif: row.hari_kerja_efektif,
      gajiHarian: Number(row.gaji_harian),
      totalPotonganAbsensi: Number(row.total_potongan_absensi),
      menitLembur: Number(row.menit_lembur ?? 0),
      upahLembur: Number(row.upah_lembur ?? 0),
      tarifPph21: Number(row.tarif_pph21 ?? 0),
      kategoriTer: row.kategori_ter ?? null,
      potonganPph21: Number(row.potongan_pph21 ?? 0),
      gajiAkhir: Number(row.gaji_akhir),
      ringkasan: summarizeRincian(rincian),
    },
  };
}

/** Rows of the "Potongan" section, in display order; zero lines are kept so the slip reads the same every month. */
export function deductionLines(slip: PayslipDetail): { label: string; amount: number }[] {
  const r = slip.ringkasan;
  const lines = [
    { label: `Alpa (${r.alpa} hari)`, amount: r.potonganAlpa },
    { label: "Keterlambatan / pulang cepat", amount: r.potonganKeterlambatan },
  ];
  // Payslips from before the per-day split: show the stored total instead.
  const split = round2(r.potonganAlpa + r.potonganKeterlambatan);
  if (Math.abs(split - slip.totalPotonganAbsensi) > 0.01) {
    lines.splice(0, 2, { label: "Potongan absensi", amount: slip.totalPotonganAbsensi });
  }
  if (slip.kategoriTer || slip.tarifPph21 > 0 || slip.potonganPph21 > 0) {
    const basis = slip.kategoriTer ? `TER ${slip.kategoriTer} · ` : "";
    lines.push({ label: `PPh 21 (${basis}${formatPersen(slip.tarifPph21)})`, amount: slip.potonganPph21 });
  }
  return lines;
}

export function totalPotongan(slip: PayslipDetail): number {
  return round2(slip.totalPotonganAbsensi + slip.potonganPph21);
}

/** "2 jam 15 menit", "45 menit". */
export function formatDurasi(menit: number): string {
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return [j ? `${j} jam` : "", m ? `${m} menit` : ""].filter(Boolean).join(" ") || "0 menit";
}

/** Rows of the "Penerimaan" section. */
export function earningLines(slip: PayslipDetail): { label: string; amount: number }[] {
  const lines = [{ label: "Gaji pokok", amount: slip.gajiPokok }];
  if (slip.upahLembur > 0) lines.push({ label: `Lembur (${formatDurasi(slip.menitLembur)})`, amount: slip.upahLembur });
  return lines;
}

export function totalPenerimaan(slip: PayslipDetail): number {
  return round2(slip.gajiPokok + slip.upahLembur);
}
