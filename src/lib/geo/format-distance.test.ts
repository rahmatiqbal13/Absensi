import { describe, it, expect } from "vitest";
import { formatDistance, walkingMinutes } from "./format-distance";

describe("formatDistance", () => {
  it("shows metres below 1 km", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(82.4)).toBe("82 m");
    expect(formatDistance(999)).toBe("999 m");
  });

  it("shows kilometres with an id-ID decimal comma at/above 1 km", () => {
    expect(formatDistance(1000)).toBe("1 km");
    expect(formatDistance(1240)).toBe("1,2 km");
    expect(formatDistance(15980)).toBe("16 km");
  });
});

describe("walkingMinutes", () => {
  it("floors to at least 1 minute", () => {
    expect(walkingMinutes(10)).toBe("± 1 menit jalan kaki");
  });
  it("estimates ~80 m per minute", () => {
    expect(walkingMinutes(400)).toBe("± 5 menit jalan kaki");
  });
});
