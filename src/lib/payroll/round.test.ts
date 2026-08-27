import { describe, it, expect } from "vitest";
import { round2 } from "./round";

describe("round2", () => {
  it("rounds half up", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
  it("leaves clean values untouched", () => {
    expect(round2(100)).toBe(100);
    expect(round2(0)).toBe(0);
  });
  it("rounds a repeating division", () => {
    expect(round2(10_000_000 / 3)).toBe(3_333_333.33);
  });
});
