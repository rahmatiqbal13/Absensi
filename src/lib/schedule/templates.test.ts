import { describe, it, expect } from "vitest";
import { branchesWithoutSchedule, summarizeDays, summarizeSchedule, templateTargetsError, templateUsage, type AppliedRow } from "./templates";

const rows: AppliedRow[] = [
  { id: "w1", template_id: "kantor", branch_id: "lab", department_id: null, nama: null },
  { id: "w2", template_id: "kantor", branch_id: "usc", department_id: null, nama: null },
  { id: "w3", template_id: "unit", branch_id: "ssfc", department_id: "admin-unit", nama: null },
  { id: "w4", template_id: "kolam", branch_id: "kolam", department_id: null, nama: null },
  { id: "w5", template_id: "pagi", branch_id: "lab", department_id: null, nama: "Pagi" },
  { id: "w6", template_id: "pagi", branch_id: "usc", department_id: null, nama: "Pagi" },
];

describe("templateUsage", () => {
  it("collects branches, departments and the employees on each template's named rows", () => {
    const u = templateUsage(rows, [
      { id: "ani", work_schedule_id: "w5" },
      { id: "budi", work_schedule_id: "w6" },
      { id: "cici", work_schedule_id: null },
    ]);
    expect(u.get("kantor")).toEqual({ branchIds: ["lab", "usc"], departmentIds: [], employeeIds: [] });
    expect(u.get("unit")).toEqual({ branchIds: [], departmentIds: ["admin-unit"], employeeIds: [] });
    expect(u.get("pagi")).toEqual({ branchIds: [], departmentIds: [], employeeIds: ["ani", "budi"] });
    expect(u.get("tidak-dipakai")).toBeUndefined();
  });
});

describe("branchesWithoutSchedule", () => {
  it("lists branches with no jadwal utama (a department or named row does not count)", () => {
    const branches = [{ id: "lab" }, { id: "usc" }, { id: "ssfc" }, { id: "kolam" }];
    expect(branchesWithoutSchedule(branches, rows)).toEqual([{ id: "ssfc" }]);
  });
});

describe("summaries", () => {
  it("names consecutive day ranges Monday-first", () => {
    expect(summarizeDays([1, 2, 3, 4, 5])).toBe("Sen–Jum");
    expect(summarizeDays([2, 3, 4, 5, 6, 0])).toBe("Sel–Min");
    expect(summarizeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Setiap hari");
    expect(summarizeDays([1, 3, 5])).toBe("Sen, Rab, Jum");
    expect(summarizeDays([6, 0])).toBe("Sab, Min");
    expect(summarizeSchedule({ jamMasuk: "07:00", jamPulang: "17:00", hariKerja: [2, 3, 4, 5, 6, 0] })).toBe("07:00–17:00 · Sel–Min");
  });

  it("explains the refusal to leave a branch without a schedule", () => {
    expect(templateTargetsError("cabang_tanpa_jadwal: SSFC, USC Pusat")).toMatch(/Cabang SSFC, USC Pusat harus tetap punya jadwal utama/);
    expect(templateTargetsError("something else")).toBeNull();
  });
});
