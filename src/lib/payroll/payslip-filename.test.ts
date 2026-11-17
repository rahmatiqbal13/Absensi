import { describe, it, expect } from "vitest";
import { payslipFileName, attachmentHeader } from "./payslip-filename";

describe("payslipFileName", () => {
  // 2026-11-17 02:52:07 UTC = 09:52:07 WIB
  const NOW = new Date("2026-11-17T02:52:07Z");

  it("uses the employee name and the Jakarta download time", () => {
    expect(payslipFileName("Budi Santoso", NOW)).toBe("Slip-Gaji_Budi-Santoso_2026-11-17_09-52-07.pdf");
  });

  it("rolls the date over at Jakarta midnight, not UTC", () => {
    expect(payslipFileName("Ani", new Date("2026-11-17T17:30:00Z"))).toBe("Slip-Gaji_Ani_2026-11-18_00-30-00.pdf");
  });

  it("makes names file-safe", () => {
    expect(payslipFileName("  Dr. Siti Nur'aini, S.E. / HRD ", NOW)).toBe(
      "Slip-Gaji_Dr-Siti-Nur-aini-S-E-HRD_2026-11-17_09-52-07.pdf",
    );
    expect(payslipFileName("José Ñúñez", NOW)).toBe("Slip-Gaji_Jose-Nunez_2026-11-17_09-52-07.pdf");
    expect(payslipFileName("???", NOW)).toBe("Slip-Gaji_Karyawan_2026-11-17_09-52-07.pdf");
  });
});

describe("attachmentHeader", () => {
  it("quotes the name for download", () => {
    expect(attachmentHeader("Slip-Gaji_A_2026-11-17_09-52-07.pdf")).toBe(
      "attachment; filename=\"Slip-Gaji_A_2026-11-17_09-52-07.pdf\"; filename*=UTF-8''Slip-Gaji_A_2026-11-17_09-52-07.pdf",
    );
  });
});
