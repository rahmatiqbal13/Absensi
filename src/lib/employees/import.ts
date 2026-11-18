import { validateEmployeeInput, type EmployeeFormInput } from "./employee-form";

/**
 * Bulk employee import from a CSV (Excel: File → Save As → CSV). Every row is
 * validated with the same rules as the "Tambah Karyawan" form; names of
 * branches / departments and the atasan's email are resolved to ids.
 * Only karyawan and atasan can be imported (HR roles need an approver chosen
 * by hand).
 */
export const IMPORT_MAX_ROWS = 200;

export const TEMPLATE_HEADERS = [
  "nama",
  "email",
  "jabatan",
  "tanggal_mulai_kerja",
  "cabang",
  "departemen",
  "peran",
  "status_kontrak",
  "status_ptkp",
  "gaji_pokok",
  "email_atasan",
] as const;

export const TEMPLATE_EXAMPLE = [
  "Budi Santoso",
  "budi@contoh.id",
  "Staf Administrasi",
  "2026-01-05",
  "Kantor Pusat",
  "Keuangan",
  "karyawan",
  "PKWT",
  "TK/0",
  "4500000",
  "",
];

/** RFC 4180-ish: quotes, escaped quotes, ; or , delimiter, BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "05/01/2026", "5-1-2026" (DD/MM/YYYY) or "2026-01-05" → "2026-01-05". */
export function normalizeDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** "4.500.000", "Rp 4,500,000", "4500000" → 4500000. */
export function normalizeMoney(v: string): string {
  return v.replace(/[^\d]/g, "") || "0";
}

const CONTRACT: Record<string, string> = { tetap: "tetap", pkwtt: "tetap", pkwt: "PKWT", kontrak: "PKWT", magang: "Magang" };

export type ImportRow = {
  line: number;
  nama: string;
  email: string;
  value?: EmployeeFormInput;
  error?: string;
};

export function validateImport(
  text: string,
  ref: {
    branches: { id: string; nama: string }[];
    departments: { id: string; nama: string; branch_id: string }[];
    employees: { id: string; email: string }[];
  },
): { ok: false; error: string } | { ok: true; rows: ImportRow[] } {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "File kosong. Isi minimal satu baris karyawan di bawah judul kolom." };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = ["nama", "email", "jabatan", "tanggal_mulai_kerja", "cabang"].filter((h) => !header.includes(h));
  if (missing.length) return { ok: false, error: `Kolom wajib tidak ada: ${missing.join(", ")}. Gunakan template.` };
  if (table.length - 1 > IMPORT_MAX_ROWS) return { ok: false, error: `Maksimal ${IMPORT_MAX_ROWS} karyawan per file.` };

  const byName = (list: { id: string; nama: string }[], name: string) =>
    list.find((x) => x.nama.trim().toLowerCase() === name.trim().toLowerCase());
  const existingEmails = new Map(ref.employees.map((e) => [e.email.toLowerCase(), e.id]));
  const seen = new Set<string>();

  const rows = table.slice(1).map((cells, i): ImportRow => {
    const get = (k: string) => (cells[header.indexOf(k)] ?? "").trim();
    const line = i + 2;
    const nama = get("nama");
    const email = get("email").toLowerCase();
    const fail = (error: string): ImportRow => ({ line, nama, email, error });

    if (email && existingEmails.has(email)) return fail("Email sudah terdaftar.");
    if (email && seen.has(email)) return fail("Email muncul dua kali di file.");
    if (email) seen.add(email);

    const branch = byName(ref.branches, get("cabang"));
    if (!branch) return fail(`Cabang "${get("cabang")}" tidak ditemukan.`);
    let departmentId: string | null = null;
    if (get("departemen")) {
      const dept = ref.departments.find(
        (d) => d.branch_id === branch.id && d.nama.trim().toLowerCase() === get("departemen").toLowerCase(),
      );
      if (!dept) return fail(`Departemen "${get("departemen")}" tidak ada di ${branch.nama}.`);
      departmentId = dept.id;
    }
    const peran = (get("peran") || "karyawan").toLowerCase();
    if (peran !== "karyawan" && peran !== "atasan") return fail("Peran hanya boleh karyawan atau atasan.");
    let atasanId: string | null = null;
    if (get("email_atasan")) {
      atasanId = existingEmails.get(get("email_atasan").toLowerCase()) ?? null;
      if (!atasanId) return fail(`Atasan ${get("email_atasan")} belum terdaftar.`);
    }
    const tanggal = normalizeDate(get("tanggal_mulai_kerja"));
    if (!tanggal) return fail("Tanggal mulai kerja harus YYYY-MM-DD atau DD/MM/YYYY.");
    const kontrak = CONTRACT[(get("status_kontrak") || "tetap").toLowerCase()];
    if (!kontrak) return fail("Status kontrak harus tetap, PKWT, atau Magang.");

    const parsed = validateEmployeeInput({
      nama,
      email,
      jabatan: get("jabatan"),
      statusKontrak: kontrak,
      statusPtkp: get("status_ptkp").toUpperCase() || "TK/0",
      tanggalMulaiKerja: tanggal,
      gajiPokok: normalizeMoney(get("gaji_pokok")),
      role: peran,
      branchId: branch.id,
      departmentId,
      atasanId,
      designatedApproverId: null,
    });
    return parsed.ok ? { line, nama, email, value: parsed.value } : fail(parsed.error);
  });
  return { ok: true, rows };
}

export function csvCell(v: string): string {
  return /[",;\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
