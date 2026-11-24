import { describe, it, expect } from "vitest";
import { suggestEmployee } from "./suggest";

const EMPS = [
  { id: "1", nama: "Budi Santoso" },
  { id: "2", nama: "Siti Aminah, S.Pd." },
  { id: "3", nama: "Budi Hartono" },
];

describe("suggestEmployee", () => {
  it("suggests a single unambiguous match", () => {
    expect(suggestEmployee("siti", EMPS)?.id).toBe("2");
    expect(suggestEmployee("Budi Santoso", EMPS)?.id).toBe("1");
  });
  it("does not guess when ambiguous or unknown", () => {
    expect(suggestEmployee("budi", EMPS)).toBeNull();
    expect(suggestEmployee("majid", EMPS)).toBeNull();
    expect(suggestEmployee("", EMPS)).toBeNull();
  });
});
