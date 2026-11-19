import { describe, it, expect } from "vitest";
import { allCategorisedAksi, kategoriOf, isAuditKategori } from "./kategori";

describe("kategoriOf", () => {
  it("groups known actions and falls back to lainnya", () => {
    expect(kategoriOf("employee_created")).toBe("buat");
    expect(kategoriOf("leave_rejected")).toBe("tolak");
    expect(kategoriOf("employee_deactivated")).toBe("hapus");
    expect(kategoriOf("attendance_evidence_viewed")).toBe("lainnya");
    expect(kategoriOf("something_new")).toBe("lainnya");
  });

  it("puts every action in at most one category", () => {
    const all = allCategorisedAksi();
    expect(new Set(all).size).toBe(all.length);
  });

  it("validates the URL value", () => {
    expect(isAuditKategori("setujui")).toBe(true);
    expect(isAuditKategori("xx")).toBe(false);
    expect(isAuditKategori(undefined)).toBe(false);
  });
});
