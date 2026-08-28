import { describe, it, expect } from "vitest";
import { recapToCsv } from "./recap-csv";
import type { RecapRow } from "./attendance-recap";

const row = (over: Partial<RecapRow>): RecapRow => ({
  employeeId: "e1", nama: "Budi", hadir: 20, terlambat: 1, pulangCepat: 0, diLuarLokasi: 0,
  alpa: 0, cuti: 1, lain: 0, totalMenitTerlambat: 12, hariKerjaEfektif: 22, ...over,
});

describe("recapToCsv", () => {
  it("emits a BOM, a header row, and one CRLF-terminated data row per input", () => {
    const csv = recapToCsv([row({})]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Nama,Hadir,Terlambat,Pulang Cepat,Di Luar Lokasi,Alpa,Cuti,Menit Terlambat,Hari Kerja Efektif");
    expect(lines[1]).toBe("Budi,20,1,0,0,0,1,12,22");
    expect(lines[2]).toBe(""); // trailing CRLF
  });

  it("quotes a name containing a comma and doubles inner quotes", () => {
    const csv = recapToCsv([row({ nama: 'Budi, "BS"' })]);
    const dataLine = csv.replace(/^﻿/, "").split("\r\n")[1];
    expect(dataLine.startsWith('"Budi, ""BS""",')).toBe(true);
  });

  it("quotes a name containing a newline", () => {
    const csv = recapToCsv([row({ nama: "Budi\nSantoso" })]);
    expect(csv).toContain('"Budi\nSantoso"');
  });

  it("returns just the header + BOM for no rows", () => {
    const csv = recapToCsv([]);
    expect(csv.replace(/^﻿/, "")).toBe("Nama,Hadir,Terlambat,Pulang Cepat,Di Luar Lokasi,Alpa,Cuti,Menit Terlambat,Hari Kerja Efektif\r\n");
  });
});
