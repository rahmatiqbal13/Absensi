import writeXlsxFile, { type SheetData } from "write-excel-file/node";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const RUPIAH = '"Rp" #,##0';
const INT = "#,##0";

type Cell = SheetData[number][number];
const head = (value: string): Cell => ({ value, fontWeight: "bold", backgroundColor: "#EEF0F7" });
const text = (value: string): Cell => ({ value, type: String });
const num = (value: number, format = INT): Cell => ({ value, type: Number, format });
const boldNum = (value: number, format = INT): Cell => ({ value, type: Number, format, fontWeight: "bold" });

export type PayrollXlsxRow = {
  nama: string;
  jabatan: string | null;
  gajiPokok: number;
  hariKerjaEfektif: number;
  upahLembur: number;
  totalPotongan: number;
  potonganPph21: number;
  gajiAkhir: number;
};

/** One payroll period as a spreadsheet, with a total row (for transfer / accounting). */
export async function payrollToXlsx(rows: PayrollXlsxRow[], sheetName: string): Promise<Buffer> {
  const sum = (pick: (r: PayrollXlsxRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const data: SheetData = [
    [
      head("No"), head("Nama"), head("Jabatan"), head("Gaji Pokok"), head("Hari Efektif"),
      head("Upah Lembur"), head("Potongan Absensi"), head("PPh 21"), head("Gaji Akhir"),
    ],
    ...rows.map((r, i) => [
      num(i + 1), text(r.nama), text(r.jabatan ?? ""), num(r.gajiPokok, RUPIAH), num(r.hariKerjaEfektif),
      num(r.upahLembur, RUPIAH), num(r.totalPotongan, RUPIAH), num(r.potonganPph21, RUPIAH), num(r.gajiAkhir, RUPIAH),
    ]),
    [
      null, { value: "Total", fontWeight: "bold" }, null,
      boldNum(sum((r) => r.gajiPokok), RUPIAH), null,
      boldNum(sum((r) => r.upahLembur), RUPIAH), boldNum(sum((r) => r.totalPotongan), RUPIAH),
      boldNum(sum((r) => r.potonganPph21), RUPIAH), boldNum(sum((r) => r.gajiAkhir), RUPIAH),
    ],
  ];
  return writeXlsxFile(data, {
    sheet: safeSheetName(sheetName),
    stickyRowsCount: 1,
    columns: [{ width: 5 }, { width: 32 }, { width: 22 }, { width: 16 }, { width: 12 }, { width: 15 }, { width: 18 }, { width: 14 }, { width: 17 }],
  }).toBuffer();
}

/** Excel sheet names: max 31 chars, none of : \ / ? * [ ]. */
export function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Sheet1";
}
