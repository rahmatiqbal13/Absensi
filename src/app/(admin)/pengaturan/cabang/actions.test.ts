import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state: { role: string | null } = { role: "super_admin" };

const insertBranchResult: { data: unknown; error: unknown } = {
  data: { id: "b-new" },
  error: null,
};
const beforeBranchRow: { data: unknown; error: unknown } = {
  data: { nama: "Kantor Lama", alamat: "Jl. Lama" },
  error: null,
};
const branchNameRow: { data: unknown; error: unknown } = {
  data: { nama: "Kantor Lama" },
  error: null,
};
const updateBranchResult: { error: unknown } = { error: null };
const deleteBranchResult: { data: unknown; error: unknown } = {
  data: [{ id: "b1" }],
  error: null,
};
const empCount: { count: number; error: unknown } = { count: 0, error: null };
const deptCount: { count: number; error: unknown } = { count: 0, error: null };
const payCount: { count: number; error: unknown } = { count: 0, error: null };
const auditResult: { error: unknown } = { error: null };

const insertBranchMock = vi.fn((v: unknown) => {
  void v;
  return { select: () => ({ single: () => Promise.resolve(insertBranchResult) }) };
});
const updateBranchEqMock = vi.fn(() => Promise.resolve(updateBranchResult));
const updateBranchMock = vi.fn((v: unknown) => {
  void v;
  return { eq: updateBranchEqMock };
});
const deleteBranchSelectMock = vi.fn(() => Promise.resolve(deleteBranchResult));
const deleteBranchEqMock = vi.fn(() => ({ select: deleteBranchSelectMock }));
const deleteBranchMock = vi.fn(() => ({ eq: deleteBranchEqMock }));
const branchSelectMock = vi.fn((cols: string) => ({
  eq: () => ({
    single: () =>
      Promise.resolve(cols === "nama" ? branchNameRow : beforeBranchRow),
  }),
}));

const countEqMock = vi.fn();
const auditInsertMock = vi.fn((v: unknown) => {
  void v;
  return Promise.resolve(auditResult);
});

function countTable(result: { count: number; error: unknown }) {
  return {
    select: () => ({
      eq: (col: string, val: string) => {
        countEqMock(col, val);
        return Promise.resolve(result);
      },
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      if (table === "branches") {
        return {
          insert: (v: unknown) => insertBranchMock(v),
          update: (v: unknown) => updateBranchMock(v),
          delete: () => deleteBranchMock(),
          select: (cols: string) => branchSelectMock(cols),
        };
      }
      if (table === "employees") return countTable(empCount);
      if (table === "departments") return countTable(deptCount);
      if (table === "payroll_periods") return countTable(payCount);
      throw new Error(`unexpected table ${table}`);
    },
  }),
  createServiceRoleSupabaseClient: () => ({
    from: () => ({ insert: (v: unknown) => auditInsertMock(v) }),
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentEmployee: async () => (state.role ? { id: "u1", role: state.role } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createBranch, updateBranch, deleteBranch } from "./actions";
import { revalidatePath } from "next/cache";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validFd = () => fd({ nama: "Kantor Surabaya", alamat: "Jl. Basuki" });

let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.role = "super_admin";
  insertBranchResult.data = { id: "b-new" };
  insertBranchResult.error = null;
  beforeBranchRow.data = { nama: "Kantor Lama", alamat: "Jl. Lama" };
  branchNameRow.data = { nama: "Kantor Lama" };
  updateBranchResult.error = null;
  deleteBranchResult.data = [{ id: "b1" }];
  deleteBranchResult.error = null;
  empCount.count = 0;
  empCount.error = null;
  deptCount.count = 0;
  deptCount.error = null;
  payCount.count = 0;
  payCount.error = null;
  auditResult.error = null;
  insertBranchMock.mockClear();
  updateBranchMock.mockClear();
  updateBranchEqMock.mockClear();
  deleteBranchMock.mockClear();
  deleteBranchEqMock.mockClear();
  deleteBranchSelectMock.mockClear();
  branchSelectMock.mockClear();
  countEqMock.mockClear();
  auditInsertMock.mockClear();
  vi.mocked(revalidatePath).mockClear();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errSpy.mockRestore();
});

describe("createBranch", () => {
  it("rejects a non-admin caller with \"Tidak diizinkan.\" and does not insert", async () => {
    state.role = "karyawan";
    const r = await createBranch(validFd());
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(insertBranchMock).not.toHaveBeenCalled();
  });

  it("rejects a blank nama with the validator message", async () => {
    const r = await createBranch(fd({ nama: "   ", alamat: "" }));
    expect(r).toEqual({ ok: false, error: "Nama cabang wajib diisi." });
    expect(insertBranchMock).not.toHaveBeenCalled();
  });

  it("inserts the branch with geofence defaults and writes a branch_created audit row", async () => {
    const r = await createBranch(validFd());
    expect(r).toEqual({ ok: true, id: "b-new" });
    expect(insertBranchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nama: "Kantor Surabaya",
        alamat: "Jl. Basuki",
        lat: 0,
        long: 0,
        radius_geofencing_meter: 100,
      }),
    );
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "u1",
        target_employee_id: null,
        aksi: "branch_created",
        detail: expect.objectContaining({
          branch_id: "b-new",
          nama: "Kantor Surabaya",
          alamat: "Jl. Basuki",
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/pengaturan/cabang");
  });

  it("still returns { ok: true, id } when the audit insert errors", async () => {
    auditResult.error = { message: "rls denied" };
    const r = await createBranch(validFd());
    expect(r).toEqual({ ok: true, id: "b-new" });
    expect(insertBranchMock).toHaveBeenCalled();
  });

  it("returns an Indonesian error when the branches insert fails", async () => {
    insertBranchResult.data = null;
    insertBranchResult.error = { message: "boom" };
    const r = await createBranch(validFd());
    expect(r).toEqual({ ok: false, error: "Gagal menambah cabang." });
    expect(auditInsertMock).not.toHaveBeenCalled();
  });
});

describe("updateBranch", () => {
  it("rejects a non-admin caller with \"Tidak diizinkan.\"", async () => {
    state.role = "karyawan";
    const r = await updateBranch("b1", validFd());
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(updateBranchMock).not.toHaveBeenCalled();
  });

  it("rejects a blank branchId with \"Cabang tidak valid.\"", async () => {
    const r = await updateBranch("", validFd());
    expect(r).toEqual({ ok: false, error: "Cabang tidak valid." });
    expect(updateBranchMock).not.toHaveBeenCalled();
  });

  it("rejects a blank nama with the validator message", async () => {
    const r = await updateBranch("b1", fd({ nama: "  ", alamat: "" }));
    expect(r).toEqual({ ok: false, error: "Nama cabang wajib diisi." });
    expect(updateBranchMock).not.toHaveBeenCalled();
  });

  it("updates branches by id and writes a branch_updated audit row with before/after", async () => {
    const r = await updateBranch("b1", validFd());
    expect(r).toEqual({ ok: true });
    expect(updateBranchMock).toHaveBeenCalledWith({
      nama: "Kantor Surabaya",
      alamat: "Jl. Basuki",
    });
    expect(updateBranchEqMock).toHaveBeenCalledWith("id", "b1");
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "u1",
        target_employee_id: null,
        aksi: "branch_updated",
        detail: expect.objectContaining({
          branch_id: "b1",
          before: { nama: "Kantor Lama", alamat: "Jl. Lama" },
          after: { nama: "Kantor Surabaya", alamat: "Jl. Basuki" },
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/pengaturan/cabang");
  });

  it("returns an Indonesian error when the branches update fails", async () => {
    updateBranchResult.error = { message: "boom" };
    const r = await updateBranch("b1", validFd());
    expect(r).toEqual({ ok: false, error: "Gagal menyimpan perubahan cabang." });
    expect(auditInsertMock).not.toHaveBeenCalled();
  });
});

describe("deleteBranch", () => {
  it("blocks deletion and names only karyawan when employees are attached", async () => {
    empCount.count = 3;
    const r = await deleteBranch("b1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("karyawan");
      expect(r.error).not.toContain("departemen");
      expect(r.error).not.toContain("payroll");
    }
    expect(deleteBranchMock).not.toHaveBeenCalled();
  });

  it("names departemen when departments are attached", async () => {
    deptCount.count = 2;
    const r = await deleteBranch("b1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("departemen");
    expect(deleteBranchMock).not.toHaveBeenCalled();
  });

  it("names payroll when payroll_periods are attached", async () => {
    payCount.count = 1;
    const r = await deleteBranch("b1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("payroll");
    expect(deleteBranchMock).not.toHaveBeenCalled();
  });

  it("deletes the branch by id and writes a branch_deleted audit row when nothing is attached", async () => {
    const r = await deleteBranch("b1");
    expect(r).toEqual({ ok: true });
    expect(deleteBranchEqMock).toHaveBeenCalledWith("id", "b1");
    expect(deleteBranchSelectMock).toHaveBeenCalledWith("id");
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "u1",
        target_employee_id: null,
        aksi: "branch_deleted",
        detail: expect.objectContaining({ branch_id: "b1" }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/pengaturan/cabang");
  });

  it("returns the not-authorized message when the delete removes no rows", async () => {
    deleteBranchResult.data = [];
    const r = await deleteBranch("b1");
    expect(r).toEqual({
      ok: false,
      error: "Gagal menghapus cabang atau Anda tidak berhak.",
    });
    expect(auditInsertMock).not.toHaveBeenCalled();
  });
});
