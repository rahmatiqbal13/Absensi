import { describe, it, expect } from "vitest";
import { monthLabel, MONTH_NAMES_ID } from "./month";

describe("monthLabel", () => {
  it("maps 1..12 to Indonesian month names", () => {
    expect(monthLabel(1)).toBe("Januari");
    expect(monthLabel(8)).toBe("Agustus");
    expect(monthLabel(12)).toBe("Desember");
    expect(MONTH_NAMES_ID).toHaveLength(12);
  });
  it("returns a dash for out-of-range input", () => {
    expect(monthLabel(0)).toBe("-");
    expect(monthLabel(13)).toBe("-");
  });
});
