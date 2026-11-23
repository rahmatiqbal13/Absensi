import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { payrollToXlsx, safeSheetName } from "./xlsx";

/** All XML inside the .xlsx (a zip), concatenated, for content assertions. */
function xml(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer));
  return Object.entries(files)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, data]) => strFromU8(data))
    .join("\n");
}

describe("payrollToXlsx", () => {
  it("writes a real xlsx with one row per slip and a total row", async () => {
    const buf = await payrollToXlsx(
      [
        { nama: "Budi", jabatan: "Staff", gajiPokok: 3_000_000, hariKerjaEfektif: 21, upahLembur: 0, totalPotongan: 0, potonganPph21: 30_000, gajiAkhir: 2_970_000 },
        { nama: "Ani", jabatan: null, gajiPokok: 4_000_000, hariKerjaEfektif: 20, upahLembur: 50_000, totalPotongan: 100_000, potonganPph21: 40_000, gajiAkhir: 3_910_000 },
      ],
      "November 2026",
    );
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const content = xml(buf);
    for (const s of ["Budi", "Ani", "Gaji Akhir", "Total", "November 2026"]) expect(content).toContain(s);
    expect(content).toContain("6880000"); // total gaji akhir, written as a number
  });
});

describe("safeSheetName", () => {
  it("strips characters Excel forbids and caps the length", () => {
    expect(safeSheetName("Gaji [Nov/Des]?")).toBe("Gaji -Nov-Des--");
    expect(safeSheetName("x".repeat(40))).toHaveLength(31);
  });
});
