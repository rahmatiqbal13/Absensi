import { describe, expect, it } from "vitest";
import {
  contractOn,
  describeContract,
  formatLama,
  formatLamaKontrak,
  contractReminderStage,
  isMagang,
  summarizeContracts,
  validateContractInput,
  type Contract,
} from "./contracts";

const c = (over: Partial<Contract>): Contract => ({
  id: "c1",
  jenis: "pkwt",
  tanggal_mulai: "2025-01-01",
  tanggal_selesai: "2025-12-31",
  catatan: null,
  ...over,
});

describe("summarizeContracts", () => {
  it("counts PKWT contracts and extensions, using the latest as current", () => {
    const s = summarizeContracts(
      [
        c({ id: "a", tanggal_mulai: "2024-01-01", tanggal_selesai: "2024-12-31" }),
        c({ id: "b", tanggal_mulai: "2025-01-01", tanggal_selesai: "2025-12-31" }),
        c({ id: "c", tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-12-31" }),
      ],
      "2026-11-18",
    );
    expect(s.current?.id).toBe("c");
    expect(s).toMatchObject({ kontrakKe: 3, perpanjangan: 2, state: "aktif", sisaHari: 43 });
  });

  it("classifies active, ending soon, ended and permanent", () => {
    expect(summarizeContracts([c({ tanggal_selesai: "2027-06-30" })], "2026-11-18").state).toBe("aktif");
    expect(summarizeContracts([c({ tanggal_selesai: "2026-12-01" })], "2026-11-18").state).toBe("segera_berakhir");
    expect(summarizeContracts([c({ tanggal_selesai: "2026-11-01" })], "2026-11-18")).toMatchObject({ state: "berakhir", sisaHari: -17 });
    expect(summarizeContracts([c({ jenis: "pkwtt", tanggal_selesai: null })], "2026-11-18").state).toBe("tetap");
    expect(summarizeContracts([], "2026-11-18").state).toBe("belum_ada");
  });

  it("does not count internships as PKWT", () => {
    expect(summarizeContracts([c({ jenis: "magang" })], "2025-06-01")).toMatchObject({ kontrakKe: 0, perpanjangan: 0 });
  });

  it("warns when total PKWT time nears the 5-year limit", () => {
    const four = [
      c({ id: "a", tanggal_mulai: "2022-01-01", tanggal_selesai: "2023-12-31" }),
      c({ id: "b", tanggal_mulai: "2024-01-01", tanggal_selesai: "2026-08-31" }),
    ];
    expect(summarizeContracts(four, "2026-01-01").mendekatiBatasPkwt).toBe(true);
    expect(summarizeContracts([c({})], "2025-06-01").mendekatiBatasPkwt).toBe(false);
  });
});

describe("contractReminderStage", () => {
  const cur = c({ tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-12-31" });
  it("H30 from 30 days out, H7 from 7 days out, berakhir once past the end", () => {
    expect(contractReminderStage(cur, "2026-11-30")).toBeNull();
    expect(contractReminderStage(cur, "2026-12-01")).toBe("H30");
    expect(contractReminderStage(cur, "2026-12-23")).toBe("H30");
    expect(contractReminderStage(cur, "2026-12-24")).toBe("H7");
    expect(contractReminderStage(cur, "2026-12-31")).toBe("H7");
    expect(contractReminderStage(cur, "2027-01-01")).toBe("berakhir");
  });
  it("never reminds for a permanent contract or one not started yet", () => {
    expect(contractReminderStage(c({ jenis: "pkwtt", tanggal_selesai: null }), "2026-12-30")).toBeNull();
    expect(contractReminderStage(c({ tanggal_mulai: "2027-02-01", tanggal_selesai: "2027-02-10" }), "2027-01-20")).toBeNull();
  });
});

describe("validateContractInput", () => {
  it("requires an end date except for PKWTT", () => {
    expect(validateContractInput({ jenis: "pkwt", tanggalMulai: "2026-01-01", tanggalSelesai: "", catatan: "" }).ok).toBe(false);
    expect(validateContractInput({ jenis: "pkwtt", tanggalMulai: "2026-01-01", tanggalSelesai: "2026-02-01", catatan: "" })).toEqual({
      ok: true,
      value: { jenis: "pkwtt", tanggalMulai: "2026-01-01", tanggalSelesai: null, catatan: null },
    });
  });
  it("rejects an end before the start and unknown types", () => {
    expect(validateContractInput({ jenis: "pkwt", tanggalMulai: "2026-02-01", tanggalSelesai: "2026-01-01", catatan: "" }).ok).toBe(false);
    expect(validateContractInput({ jenis: "honorer", tanggalMulai: "2026-02-01", tanggalSelesai: "2026-03-01", catatan: "" }).ok).toBe(false);
  });
});

describe("isMagang", () => {
  it("matches any casing of magang", () => {
    expect(isMagang("Magang")).toBe(true);
    expect(isMagang("magang kampus")).toBe(true);
    expect(isMagang("PKWT")).toBe(false);
    expect(isMagang(null)).toBe(false);
  });
});

describe("formatLama", () => {
  it("counts calendar years and months", () => {
    expect(formatLama("2023-07-17", "2026-11-18")).toBe("3 tahun 4 bulan");
    expect(formatLama("2023-07-17", "2026-07-17")).toBe("3 tahun");
    expect(formatLama("2026-11-01", "2026-11-18")).toBe("17 hari");
  });
  it("reads a 1 Jan – 31 Dec contract as exactly 1 year", () => {
    expect(formatLamaKontrak({ tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-12-31" })).toBe("1 tahun");
    expect(formatLamaKontrak({ tanggal_mulai: "2026-07-01", tanggal_selesai: "2026-12-31" })).toBe("6 bulan");
    expect(formatLamaKontrak({ tanggal_mulai: "2026-01-01", tanggal_selesai: null })).toBeNull();
  });
});

describe("contractOn", () => {
  const history = [
    c({ id: "k1", tanggal_mulai: "2023-07-17", tanggal_selesai: "2023-12-31" }),
    c({ id: "k2", tanggal_mulai: "2024-01-01", tanggal_selesai: "2024-12-31" }),
    c({ id: "k3", tanggal_mulai: "2025-01-01", tanggal_selesai: "2025-12-31" }),
    c({ id: "k4", tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-12-31" }),
  ];
  it("picks the contract in force on a date, counted as of that date", () => {
    expect(contractOn(history, "2026-11-30")).toMatchObject({ contract: { id: "k4" }, kontrakKe: 4 });
    expect(contractOn(history, "2024-06-30")).toMatchObject({ contract: { id: "k2" }, kontrakKe: 2 });
    expect(contractOn(history, "2023-01-31")).toBeNull();
  });
  it("describes it for the payslip", () => {
    const on = contractOn(history, "2026-11-30")!;
    expect(describeContract(on.contract, on.kontrakKe)).toEqual({ status: "PKWT ke-4", periode: "1 Januari 2026 – 31 Desember 2026" });
  });
});
