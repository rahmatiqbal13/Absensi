import { describe, it, expect } from "vitest";
import { validateBranchInput } from "./validate-branch";

describe("validateBranchInput", () => {
  it("accepts a name and address, trimming both", () => {
    expect(validateBranchInput({ nama: "  Kantor Surabaya  ", alamat: "  Jl. Basuki  " })).toEqual({
      ok: true,
      value: { nama: "Kantor Surabaya", alamat: "Jl. Basuki" },
    });
  });

  it("accepts a name with no address (empty -> null)", () => {
    expect(validateBranchInput({ nama: "Kantor Pusat", alamat: "" })).toEqual({
      ok: true,
      value: { nama: "Kantor Pusat", alamat: null },
    });
    expect(validateBranchInput({ nama: "Kantor Pusat", alamat: null })).toEqual({
      ok: true,
      value: { nama: "Kantor Pusat", alamat: null },
    });
  });

  it("rejects a blank name", () => {
    expect(validateBranchInput({ nama: "   ", alamat: null })).toEqual({
      ok: false,
      error: "Nama cabang wajib diisi.",
    });
    expect(validateBranchInput({ nama: null, alamat: null }).ok).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(validateBranchInput({ nama: "x".repeat(101), alamat: null })).toEqual({
      ok: false,
      error: "Nama cabang maksimal 100 karakter.",
    });
  });

  it("rejects an address over 200 chars", () => {
    expect(validateBranchInput({ nama: "OK", alamat: "y".repeat(201) })).toEqual({
      ok: false,
      error: "Alamat maksimal 200 karakter.",
    });
  });
});
