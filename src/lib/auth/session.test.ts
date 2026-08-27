import { describe, it, expect, vi } from "vitest";
import { getCurrentEmployee } from "./session";

function makeMockDb(session: any, employee: any) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: session }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: employee, error: null }),
        }),
      }),
    }),
  };
}

describe("getCurrentEmployee", () => {
  it("returns null when there is no authenticated user", async () => {
    const db = makeMockDb(null, null);
    const result = await getCurrentEmployee(db as any);
    expect(result).toBeNull();
  });

  it("returns the employee record for the authenticated user", async () => {
    const db = makeMockDb(
      { id: "user-1" },
      {
        id: "user-1",
        nama: "Budi",
        email: "budi@test.local",
        role: "hr_admin",
        branch_id: "branch-1",
        status: "aktif",
      },
    );
    const result = await getCurrentEmployee(db as any);
    expect(result).toEqual({
      id: "user-1",
      nama: "Budi",
      email: "budi@test.local",
      role: "hr_admin",
      branchId: "branch-1",
    });
  });
});

describe("getCurrentEmployee — query error", () => {
  it("console.errors the query error and returns null", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    };
    expect(await getCurrentEmployee(db as any)).toBeNull();
    expect(spy).toHaveBeenCalledWith(
      "getCurrentEmployee: employees query failed",
      expect.objectContaining({ message: "boom" }),
    );
    spy.mockRestore();
  });
});

describe("getCurrentEmployee — deactivated employees", () => {
  it("returns null when the employee status is nonaktif", async () => {
    const db = makeMockDb(
      { id: "u1" },
      { id: "u1", nama: "X", email: "x@y.z", role: "karyawan", branch_id: "b1", status: "nonaktif" },
    );
    expect(await getCurrentEmployee(db as any)).toBeNull();
  });

  it("returns the employee when status is aktif", async () => {
    const db = makeMockDb(
      { id: "u1" },
      { id: "u1", nama: "X", email: "x@y.z", role: "karyawan", branch_id: "b1", status: "aktif" },
    );
    expect((await getCurrentEmployee(db as any))?.id).toBe("u1");
  });
});
