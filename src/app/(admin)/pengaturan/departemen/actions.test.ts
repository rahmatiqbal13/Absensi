import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ from })),
}));
const getCurrentEmployee = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getCurrentEmployee: (...a: unknown[]) => getCurrentEmployee(...a),
}));

import { deleteDepartment } from "./actions";

// Thenable query-builder mock (same shape as payroll/actions.test.ts).
function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "delete", "eq", "in"]) b[m] = vi.fn(() => b);
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return b;
}

const HR_ADMIN = { id: "u1", role: "hr_admin" };

beforeEach(() => {
  from.mockReset();
  getCurrentEmployee.mockReset();
  getCurrentEmployee.mockResolvedValue(HR_ADMIN);
});

describe("deleteDepartment", () => {
  it("refuses when the department still has members", async () => {
    from.mockImplementation((table: string) => {
      if (table === "employees") return q({ count: 3, error: null });
      throw new Error(`unexpected table ${table}`);
    });
    const result = await deleteDepartment("d1");
    expect(result).toEqual({
      ok: false,
      error: "Departemen masih dipakai 3 karyawan. Pindahkan mereka dulu.",
    });
  });

  it("deletes when no members reference the department", async () => {
    from.mockImplementation((table: string) => {
      if (table === "employees") return q({ count: 0, error: null });
      if (table === "departments") return q({ data: [{ id: "d1" }], error: null });
      throw new Error(`unexpected table ${table}`);
    });
    const result = await deleteDepartment("d1");
    expect(result).toEqual({ ok: true });
  });

  it("returns a fixed message when the member count query errors", async () => {
    from.mockImplementation((table: string) => {
      if (table === "employees") return q({ count: null, error: { message: "boom" } });
      throw new Error(`unexpected table ${table}`);
    });
    const result = await deleteDepartment("d1");
    expect(result).toEqual({ ok: false, error: "Gagal menghapus departemen." });
  });

  it("denies a non-admin before any query", async () => {
    getCurrentEmployee.mockResolvedValue({ id: "u2", role: "karyawan" });
    const result = await deleteDepartment("d1");
    expect(result).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(from).not.toHaveBeenCalled();
  });
});
