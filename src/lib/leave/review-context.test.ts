import { describe, it, expect } from "vitest";
import { countWorkingDays, findClashes, rangesOverlap, type TeamLeave } from "./review-context";

const MON_FRI = [1, 2, 3, 4, 5];

describe("countWorkingDays", () => {
  it("skips weekends", () => {
    // 2026-12-21 (Mon) .. 2026-12-27 (Sun)
    expect(countWorkingDays("2026-12-21", "2026-12-27", MON_FRI, [])).toBe(5);
  });

  it("skips holidays that fall on working days", () => {
    expect(countWorkingDays("2026-12-21", "2026-12-27", MON_FRI, ["2026-12-24", "2026-12-25"])).toBe(3);
  });

  it("respects a six-day schedule", () => {
    expect(countWorkingDays("2026-12-21", "2026-12-27", [1, 2, 3, 4, 5, 6], [])).toBe(6);
  });

  it("counts a single day", () => {
    expect(countWorkingDays("2026-11-06", "2026-11-06", MON_FRI, [])).toBe(1); // Friday
    expect(countWorkingDays("2026-11-07", "2026-11-07", MON_FRI, [])).toBe(0); // Saturday
  });
});

describe("rangesOverlap", () => {
  it("treats shared end days as overlapping", () => {
    expect(rangesOverlap("2026-12-22", "2026-12-24", "2026-12-24", "2026-12-31")).toBe(true);
    expect(rangesOverlap("2026-12-22", "2026-12-23", "2026-12-24", "2026-12-31")).toBe(false);
  });
});

describe("findClashes", () => {
  const req = {
    id: "r1",
    employeeId: "e1",
    branchId: "b1",
    departmentId: "d1",
    jenis: "tahunan",
    tanggalMulai: "2026-12-22",
    tanggalSelesai: "2026-12-24",
  };
  const leave = (o: Partial<TeamLeave>): TeamLeave => ({
    requestId: "x",
    employeeId: "e2",
    nama: "Melati",
    status: "pending",
    tanggalMulai: "2026-12-23",
    tanggalSelesai: "2026-12-31",
    departmentId: "d1",
    branchId: "b1",
    ...o,
  });

  it("finds an overlapping teammate", () => {
    expect(findClashes(req, [leave({})])).toHaveLength(1);
  });

  it("ignores the request itself, the same employee, other departments/branches and non-overlaps", () => {
    expect(
      findClashes(req, [
        leave({ requestId: "r1" }),
        leave({ employeeId: "e1" }),
        leave({ departmentId: "d2" }),
        leave({ branchId: "b2" }),
        leave({ tanggalMulai: "2027-01-02", tanggalSelesai: "2027-01-03" }),
      ]),
    ).toEqual([]);
  });

  it("returns nothing when the requester has no department", () => {
    expect(findClashes({ ...req, departmentId: null }, [leave({ departmentId: null })])).toEqual([]);
  });
});
