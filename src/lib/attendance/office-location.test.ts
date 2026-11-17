import { describe, it, expect, vi } from "vitest";
import { pickOfficeLocation, loadOfficeLocation } from "./office-location";

const BRANCH = { lat: -6.2, long: 106.8, radius_geofencing_meter: 100 };

describe("pickOfficeLocation", () => {
  it("uses the department pin and its radius", () => {
    expect(pickOfficeLocation(BRANCH, { lat: -6.25, long: 106.9, radius_geofencing_meter: 300 })).toEqual({
      lat: -6.25, long: 106.9, radius_geofencing_meter: 300, sumber: "departemen",
    });
  });
  it("falls back to the branch radius when the department has none", () => {
    expect(pickOfficeLocation(BRANCH, { lat: -6.25, long: 106.9, radius_geofencing_meter: null }).radius_geofencing_meter).toBe(100);
  });
  it("uses the branch pin when the department has no pin", () => {
    expect(pickOfficeLocation(BRANCH, { lat: null, long: null, radius_geofencing_meter: null })).toEqual({ ...BRANCH, sumber: "cabang" });
  });
  it("ignores a department from another branch", () => {
    const dept = { lat: -7, long: 110, radius_geofencing_meter: 50, branch_id: "other" };
    expect(pickOfficeLocation(BRANCH, dept, "b1").sumber).toBe("cabang");
  });
});

describe("loadOfficeLocation", () => {
  const db = (res: { data: unknown; error: unknown }) => {
    const q: Record<string, unknown> = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.maybeSingle = () => Promise.resolve(res);
    return { from: vi.fn(() => q) };
  };

  it("does not query without a department", async () => {
    const d = db({ data: null, error: null });
    expect((await loadOfficeLocation(d as never, BRANCH, "b1", null)).sumber).toBe("cabang");
    expect(d.from).not.toHaveBeenCalled();
  });

  it("falls back to the branch pin before migration 0037", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = db({ data: null, error: { code: "42703", message: "column departments.lat does not exist" } });
    expect(await loadOfficeLocation(d as never, BRANCH, "b1", "dept")).toEqual({ ...BRANCH, sumber: "cabang" });
    spy.mockRestore();
  });
});
