import { describe, it, expect } from "vitest";
import { preview, recipientsOf, validateAnnouncement } from "./announcements";

const B = "11111111-1111-1111-1111-111111111111";
const D = "22222222-2222-2222-2222-222222222222";
const EMPS = [
  { id: "a", branch_id: B, department_id: D },
  { id: "b", branch_id: B, department_id: null },
  { id: "c", branch_id: "other", department_id: null },
];

describe("validateAnnouncement", () => {
  it("needs a title and body", () => {
    expect(validateAnnouncement({ judul: "", isi: "x" }).ok).toBe(false);
    expect(validateAnnouncement({ judul: "x", isi: " " }).ok).toBe(false);
  });
  it("keeps only the target matching the chosen sasaran", () => {
    expect(validateAnnouncement({ judul: "Rapat", isi: "Jam 9", sasaran: "cabang", branch_id: B, department_id: D })).toEqual({
      ok: true,
      value: { judul: "Rapat", isi: "Jam 9", sasaran: "cabang", branch_id: B, department_id: null },
    });
    expect(validateAnnouncement({ judul: "Rapat", isi: "Jam 9", sasaran: "departemen" }).ok).toBe(false);
  });
});

describe("recipientsOf", () => {
  it("targets everyone, a branch, or a department, never the author", () => {
    expect(recipientsOf({ sasaran: "semua", branch_id: null, department_id: null }, EMPS, "a")).toEqual(["b", "c"]);
    expect(recipientsOf({ sasaran: "cabang", branch_id: B, department_id: null }, EMPS)).toEqual(["a", "b"]);
    expect(recipientsOf({ sasaran: "departemen", branch_id: null, department_id: D }, EMPS)).toEqual(["a"]);
  });
});

describe("preview", () => {
  it("flattens and truncates", () => {
    expect(preview("Halo\n\nsemua")).toBe("Halo semua");
    expect(preview("x".repeat(200), 10)).toBe("xxxxxxxxx…");
  });
});
