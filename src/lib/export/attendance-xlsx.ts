import writeXlsxFile, { type Sheet, type SheetData } from "write-excel-file/node";
import type { RecapRow } from "@/lib/laporan/attendance-recap";
import {
  dailyStatusLabel,
  durasiDetik,
  formatDurasiJms,
  formatDurasiPanjang,
  formatJamWib,
  locationFlagsLabel,
  keteranganLengkap,
  summarizeDaily,
  type DailyRow,
} from "@/lib/laporan/employee-daily";
import { safeSheetName } from "./xlsx";

/**
 * The attendance report download, laid out like an official attendance form:
 * letterhead (kop), title and period, an identity block, a bordered table, a
 * totals row, a recapitulation and signature blocks.
 *
 * Sheet 1 "Rekap Kehadiran" lists every employee; then one sheet per employee
 * (tab = name) with a row per day, jam masuk / pulang and durasi to the second.
 */
export type AttendanceXlsxInput = {
  org: { nama: string; alamat: string | null };
  branchNama: string;
  from: string; // YYYY-MM-DD
  to: string;
  /** "23 Nov 2026 09:45" — the print stamp at the bottom. */
  dicetak: string;
  /** Today (YYYY-MM-DD, WIB) for the "tempat, tanggal" line above the signatures. */
  hariIni: string;
  rows: RecapRow[];
  daily: Record<string, DailyRow[]>;
  jadwal: Record<string, string>;
  jabatan: Record<string, string>;
};

type Cell = SheetData[number][number];
type CellStyle = Exclude<Cell, null | undefined | string | number | boolean | Date>;

const COLS = 13;
const BORDER = "#000000";
const HEAD_BG = "#D9E1F2";
const MUTED_BG = "#F2F2F2";
/** Only one clock event (masuk or pulang): work time 0, its own colour (= --single). */
const ABSEN_SEKALI_BG = "#FBDCF0";
const INT = "#,##0";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
/** "2026-11-01" -> "1 November 2026". */
export function tanggalPanjang(date: string): string {
  const d = utc(date);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "2026-11-01" -> "01/11/2026". */
function tanggalPendek(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

// ---- cell helpers -------------------------------------------------------

const bordered: CellStyle = { borderStyle: "thin", borderColor: BORDER, alignVertical: "center" };

function th(value: string): Cell {
  return { ...bordered, value, fontWeight: "bold", backgroundColor: HEAD_BG, align: "center", wrap: true };
}
function td(value: string | number | null, opts: CellStyle = {}): Cell {
  if (value == null || value === "") return { ...bordered, ...opts, value: "", type: String };
  return typeof value === "number"
    ? { ...bordered, align: "center", ...opts, value, type: Number, format: INT }
    : { ...bordered, ...opts, value, type: String };
}
/** A cell spanning `span` columns, padded with the nulls the merge needs. */
function spanned(span: number, cell: CellStyle): Cell[] {
  return [{ ...cell, columnSpan: span }, ...Array.from({ length: span - 1 }, () => null)];
}
const blankRow = (): Cell[] => Array.from({ length: COLS }, () => null);

/** Letterhead, a rule, the title and the period — the top of every sheet. */
function header(input: AttendanceXlsxInput, title: string): Cell[][] {
  const rows: Cell[][] = [
    spanned(COLS, { value: input.org.nama.toUpperCase(), fontWeight: "bold", fontSize: 14, align: "center" }),
  ];
  if (input.org.alamat) rows.push(spanned(COLS, { value: input.org.alamat, align: "center", fontSize: 10 }));
  // The kop rule: a medium line under the letterhead.
  rows.push(
    Array.from({ length: COLS }, () => ({ value: "", type: String, bottomBorderStyle: "medium", bottomBorderColor: BORDER }) as Cell),
  );
  rows.push(blankRow());
  rows.push(spanned(COLS, { value: title, fontWeight: "bold", fontSize: 12, align: "center" }));
  rows.push(
    spanned(COLS, { value: `Periode: ${tanggalPanjang(input.from)} s.d. ${tanggalPanjang(input.to)}`, align: "center" }),
  );
  rows.push(blankRow());
  return rows;
}

/** "Nama        : Budi" lines; the label spans `labelCols` columns. */
function identity(pairs: [string, string][], labelCols: number): Cell[][] {
  return pairs.map(([label, value]) => [
    ...spanned(labelCols, { value: label, fontWeight: "bold" }),
    ...spanned(COLS - labelCols, { value: `: ${value}` }),
  ]);
}

/** Two signature blocks: the employee (or the preparer) left, the approver right. */
function signatures(input: AttendanceXlsxInput, left: { role: string; nama: string | null }): Cell[][] {
  const L = 1; // column B
  const R = 9; // column J
  const W = 4;
  const row = (l: string | null, r: string | null, bold = false): Cell[] => {
    const out = blankRow();
    const put = (col: number, value: string | null) => {
      if (value == null) return;
      out.splice(col, W, ...spanned(W, { value, align: "center", ...(bold ? { fontWeight: "bold", textDecoration: { underline: true } } : {}) }));
    };
    put(L, l);
    put(R, r);
    return out;
  };
  return [
    blankRow(),
    row(null, `................, ${tanggalPanjang(input.hariIni)}`),
    row(left.role, "Mengetahui,"),
    row(null, "Atasan / HRD"),
    blankRow(),
    blankRow(),
    blankRow(),
    row(left.nama ? left.nama : "(................................)", "(................................)", true),
    row(null, "NIP. ................................"),
    blankRow(),
    spanned(COLS, { value: `Dicetak: ${input.dicetak} WIB`, fontStyle: "italic", fontSize: 9, textColor: "#595959" }),
  ];
}

// ---- sheets -------------------------------------------------------------

function totalDetik(days: readonly DailyRow[]): number {
  return days.reduce((t, d) => t + (durasiDetik(d) ?? 0), 0);
}

function rekapSheet(input: AttendanceXlsxInput): Sheet<Buffer> {
  const heads = [
    "No", "Nama Pegawai", "Jabatan", "Hari Kerja Efektif", "Hadir", "Terlambat", "Pulang Cepat",
    "Di Luar Lokasi", "Alpa", "Cuti", "Menit Terlambat", "Menit Lembur", "Total Jam Kerja (jam:menit:detik)",
  ];
  const body = input.rows.map((r, i) => {
    const detik = totalDetik(input.daily[r.employeeId] ?? []);
    return [
      td(i + 1), td(r.nama), td(input.jabatan[r.employeeId] ?? ""), td(r.hariKerjaEfektif), td(r.hadir),
      td(r.terlambat), td(r.pulangCepat), td(r.diLuarLokasi), td(r.alpa), td(r.cuti),
      td(r.totalMenitTerlambat), td(r.menitLembur), td(formatDurasiJms(detik), { align: "center" }),
    ];
  });
  const sum = (pick: (r: RecapRow) => number) => input.rows.reduce((t, r) => t + pick(r), 0);
  const grand = input.rows.reduce((t, r) => t + totalDetik(input.daily[r.employeeId] ?? []), 0);
  const bold: CellStyle = { fontWeight: "bold", backgroundColor: MUTED_BG };
  const total = [
    ...spanned(3, { ...(td("JUMLAH", { ...bold, align: "center" }) as CellStyle) }),
    td(sum((r) => r.hariKerjaEfektif), bold), td(sum((r) => r.hadir), bold), td(sum((r) => r.terlambat), bold),
    td(sum((r) => r.pulangCepat), bold), td(sum((r) => r.diLuarLokasi), bold), td(sum((r) => r.alpa), bold),
    td(sum((r) => r.cuti), bold), td(sum((r) => r.totalMenitTerlambat), bold), td(sum((r) => r.menitLembur), bold),
    td(formatDurasiJms(grand), { ...bold, align: "center" }),
  ];

  const data: SheetData = [
    ...header(input, "REKAPITULASI KEHADIRAN PEGAWAI"),
    ...identity([
      ["Unit / Cabang", input.branchNama],
      ["Jumlah Pegawai", `${input.rows.length} orang`],
    ], 2),
    blankRow(),
    heads.map((h) => ({ ...(th(h) as CellStyle), height: 32 })),
    ...body,
    total,
    ...signatures(input, { role: "Dibuat oleh,", nama: null }),
  ];
  return {
    data,
    sheet: "Rekap Kehadiran",
    orientation: "landscape",
    showGridLines: false,
    columns: [
      { width: 5 }, { width: 30 }, { width: 20 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 10 },
      { width: 10 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 11 }, { width: 18 },
    ],
  };
}

function employeeSheet(input: AttendanceXlsxInput, r: RecapRow, sheet: string): Sheet<Buffer> {
  const days = input.daily[r.employeeId] ?? [];
  const sum = summarizeDaily(days);
  const detik = totalDetik(days);
  const heads = [
    "No", "Hari", "Tanggal", "Status", "Jam Masuk", "Jam Pulang", "Durasi Kerja (jam:menit: detik)",
    "Terlambat (menit)", "Pulang Cepat (menit)", "Lembur (menit)", "Keterangan", "Catatan", "Peringatan Lokasi",
  ];
  const body = days.map((d, i) => {
    // Days off / before joining are shaded, alpa is red — like a printed register.
    const off = d.kind === "libur" || d.kind === "bukan_hari_kerja" || d.kind === "belum_bekerja";
    const row: CellStyle = off ? { backgroundColor: MUTED_BG } : d.absenSekali ? { backgroundColor: ABSEN_SEKALI_BG } : {};
    const status: CellStyle = d.kind === "alpa" ? { ...row, textColor: "#C00000", fontWeight: "bold" } : row;
    const det = durasiDetik(d);
    const c: CellStyle = { ...row, align: "center" };
    return [
      td(i + 1, row), td(HARI[utc(d.tanggal).getUTCDay()], row), td(tanggalPendek(d.tanggal), c),
      td(dailyStatusLabel(d), status), td(d.jamMasuk ? formatJamWib(d.jamMasuk) : "", c),
      td(d.jamPulang ? formatJamWib(d.jamPulang) : "", c), td(det == null ? "" : formatDurasiJms(det), c),
      td(d.menitTerlambat || "", row), td(d.menitPulangCepat || "", row), td(d.menitLembur || "", row),
      td(keteranganLengkap(d), { ...row, wrap: true }), td(d.catatan ?? "", { ...row, wrap: true }),
      td(locationFlagsLabel(d.flagLokasi), { ...row, wrap: true }),
    ];
  });
  const bold: CellStyle = { fontWeight: "bold", backgroundColor: MUTED_BG };
  const total = [
    ...spanned(6, { ...(td("JUMLAH", { ...bold, align: "center" }) as CellStyle) }),
    td(formatDurasiJms(detik), { ...bold, align: "center" }), td(sum.menitTerlambat, bold),
    td(sum.menitPulangCepat, bold), td(sum.menitLembur, bold), td("", bold), td("", bold), td("", bold),
  ];
  const durasiMenit = (menit: number) => formatDurasiPanjang(menit * 60).replace(/ 0 detik$/, "");

  const data: SheetData = [
    ...header(input, "DAFTAR HADIR PEGAWAI"),
    ...identity([
      ["Nama Pegawai", r.nama],
      ["Jabatan", input.jabatan[r.employeeId] || "-"],
      ["Unit / Cabang", input.branchNama],
      ["Jadwal Kerja", input.jadwal[r.employeeId] ?? "-"],
    ], 3),
    blankRow(),
    heads.map((h) => ({ ...(th(h) as CellStyle), height: 32 })),
    ...body,
    total,
    blankRow(),
    spanned(COLS, { value: "REKAPITULASI", fontWeight: "bold" }),
    ...identity([
      ["Hari Kerja Efektif", `${sum.hariKerja} hari`],
      ["Hadir", `${sum.hadir} hari (tepat waktu ${sum.tepatWaktu}, terlambat ${sum.terlambat}, pulang cepat ${sum.pulangCepat}, di luar lokasi ${sum.diLuarLokasi})`],
      ["Alpa", `${sum.alpa} hari`],
      ["Cuti / Izin", `${sum.cuti} hari`],
      ["Total Jam Kerja", formatDurasiPanjang(detik)],
      ["Total Keterlambatan", durasiMenit(sum.menitTerlambat)],
      ["Total Lembur", durasiMenit(sum.menitLembur)],
    ], 3),
    ...signatures(input, { role: "Pegawai yang bersangkutan,", nama: r.nama }),
  ];
  return {
    data,
    sheet,
    orientation: "landscape",
    showGridLines: false,
    columns: [
      { width: 5 }, { width: 9 }, { width: 11 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 17 },
      { width: 10 }, { width: 10 }, { width: 9 }, { width: 24 }, { width: 24 }, { width: 22 },
    ],
  };
}

/**
 * A safe sheet name that is not yet in `used` (Excel compares names
 * case-insensitively): two employees named "Budi" become "Budi" and "Budi (2)".
 */
export function uniqueSheetName(name: string, used: Set<string>): string {
  const base = safeSheetName(name.trim().replace(/^'+|'+$/g, "")) || "Pegawai";
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function attendanceToXlsx(input: AttendanceXlsxInput): Promise<Buffer> {
  const rekap = rekapSheet(input);
  const used = new Set([rekap.sheet!.toLowerCase()]);
  const perEmployee = input.rows.map((r) => employeeSheet(input, r, uniqueSheetName(r.nama, used)));
  return writeXlsxFile([rekap, ...perEmployee]).toBuffer();
}
