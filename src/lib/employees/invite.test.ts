import { describe, it, expect, vi } from "vitest";
import { inviteEmployee } from "./invite";

function makeMockDb(overrides: Partial<any> = {}) {
  return {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: "new-user-id" } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "new-user-id" },
            error: null,
          }),
        }),
      }),
    }),
    ...overrides,
  };
}

const baseInput = {
  nama: "Budi",
  email: "budi@test.local",
  branchId: "branch-1",
  jabatan: "Staff",
  statusKontrak: "tetap",
  tanggalMulaiKerja: "2026-01-01",
  gajiPokok: 5_000_000,
  role: "karyawan" as const,
};

describe("inviteEmployee", () => {
  it("creates an auth user and an employees row, returning the new id", async () => {
    const db = makeMockDb();
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: true, employeeId: "new-user-id" });
    expect(db.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "budi@test.local" }),
    );
  });

  it("rejects hr_admin/super_admin invites without a designatedApproverId", async () => {
    const db = makeMockDb();
    const result = await inviteEmployee(
      { ...baseInput, role: "hr_admin" },
      db as any,
    );
    expect(result).toEqual({
      ok: false,
      error: "designatedApproverId is required for hr_admin and super_admin roles",
    });
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rolls back the auth user if the employees insert fails", async () => {
    const db = makeMockDb({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "duplicate email" },
            }),
          }),
        }),
      }),
    });
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: false, error: "duplicate email" });
    expect(db.auth.admin.deleteUser).toHaveBeenCalledWith("new-user-id");
  });

  it("returns early if auth user creation fails, without attempting employees insert", async () => {
    const db = makeMockDb({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: "auth service error" },
          }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    });
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: false, error: "auth service error" });
    expect(db.from).not.toHaveBeenCalled();
  });
});
