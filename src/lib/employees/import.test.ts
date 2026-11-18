import { describe, it, expect } from "vitest";
import { normalizeDate, normalizeMoney, parseCsv, validateImport } from "./import";

const REF = {
  branches: [{ id: "b1", nama: "Kantor Pusat" }],
  departments: [{ id: "d1", nama: "Keuangan", branch_id: "b1" }],
  employees: [{ id: "a1", email: "atasan@contoh.id" }],
};
const HEADER = "nama;email;jabatan;tanggal_mulai_kerja;cabang;departemen;peran;status_kontrak;status_ptkp;gaji_pokok;email_atasan";

describe("parseCsv", () => {
  it("handles ; delimiters, quotes, BOM and blank lines", () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"say ""hi"""\r\n\r\n')).toEqual([["a", "b"], ["x;1", 'say "hi"']]);
  });
  it("detects comma files too", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("normalizers", () => {
  it("dates and money", () => {
    expect(normalizeDate("5/1/2026")).toBe("2026-01-05");
    expect(normalizeDate("2026-01-05")).toBe("2026-01-05");
    expect(normalizeDate("Jan 5")).toBeNull();
    expect(normalizeMoney("Rp 4.500.000")).toBe("4500000");
  });
});

describe("validateImport", () => {
  it("resolves names to ids and validates each row", () => {
    const res = validateImport(
      `${HEADER}\nBudi;BUDI@contoh.id;Staf;05/01/2026;kantor pusat;keuangan;karyawan;pkwt;;4.500.000;atasan@contoh.id`,
      REF,
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.rows[0].value).toMatchObject({
      email: "budi@contoh.id",
      branchId: "b1",
      departmentId: "d1",
      atasanId: "a1",
      statusKontrak: "PKWT",
      tanggalMulaiKerja: "2026-01-05",
      gajiPokok: 4_500_000,
      role: "karyawan",
    });
  });

  it("reports problems per line without stopping the others", () => {
    const res = validateImport(
      [
        HEADER,
        "A;atasan@contoh.id;Staf;2026-01-05;Kantor Pusat;;karyawan;;;0;",
        "B;b@contoh.id;Staf;2026-01-05;Cabang X;;karyawan;;;0;",
        "C;c@contoh.id;Staf;2026-01-05;Kantor Pusat;;hr_admin;;;0;",
        "D;d@contoh.id;Staf;2026-01-05;Kantor Pusat;;karyawan;;;0;",
        "E;d@contoh.id;Staf;2026-01-05;Kantor Pusat;;karyawan;;;0;",
      ].join("\n"),
      REF,
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.rows.map((r) => [r.line, r.error ?? "ok"])).toEqual([
      [2, "Email sudah terdaftar."],
      [3, 'Cabang "Cabang X" tidak ditemukan.'],
      [4, "Peran hanya boleh karyawan atau atasan."],
      [5, "ok"],
      [6, "Email muncul dua kali di file."],
    ]);
  });

  it("rejects files without the required columns", () => {
    expect(validateImport("nama,email\nA,a@x.id", REF)).toMatchObject({ ok: false });
  });
});
