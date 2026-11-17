import { describe, it, expect, vi } from "vitest";
import { isMissingColumn, logOptionalLookup } from "./missing-column";

describe("isMissingColumn", () => {
  it("recognises Postgres 42703 and its message", () => {
    expect(isMissingColumn({ code: "42703" })).toBe(true);
    expect(isMissingColumn({ message: "column work_schedules.hitung_lembur does not exist" })).toBe(true);
    expect(isMissingColumn({ code: "PGRST116" })).toBe(false);
    expect(isMissingColumn(null)).toBe(false);
  });
});

describe("logOptionalLookup", () => {
  it("warns (not errors) for a pending migration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logOptionalLookup("x", { code: "42703" }, "0039");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("0039"));
    expect(error).not.toHaveBeenCalled();
    logOptionalLookup("x", { code: "500" }, "0039");
    expect(error).toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });
});
