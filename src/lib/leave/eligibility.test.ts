import { describe, it, expect } from "vitest";
import { addMonths, annualLeaveEligibleFrom, requiresAttachment } from "./eligibility";

describe("addMonths", () => {
  it("adds months and clamps to the month end", () => {
    expect(addMonths("2025-03-10", 12)).toBe("2026-03-10");
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2023-02-28", 12)).toBe("2024-02-28");
    expect(addMonths("2024-11-15", 3)).toBe("2025-02-15");
  });
});

describe("annualLeaveEligibleFrom", () => {
  it("is 12 months after the join date", () => {
    expect(annualLeaveEligibleFrom("2025-06-01")).toBe("2026-06-01");
    expect(annualLeaveEligibleFrom(null)).toBeNull();
  });
});

describe("requiresAttachment", () => {
  it("only for sick leave over one day", () => {
    expect(requiresAttachment("sakit", 2)).toBe(true);
    expect(requiresAttachment("sakit", 1)).toBe(false);
    expect(requiresAttachment("tahunan", 5)).toBe(false);
  });
});
