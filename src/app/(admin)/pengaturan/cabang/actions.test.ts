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
const branchStarRow: { data: unknown; error: unknown } = {
  data: { id: "b1", nama: "Kantor Lama", alamat: "Jl. Lama", lat: 0, long: 0 },
  error: null,
};
const updateBranchResult: { data: unknown; error: unknown } = {
  data: [{ id: "b1" }],
  error: null,
};
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
const updateBranchSelectMock = vi.fn(() => Promise.resolve(updateBranchResult));
const updateBranchEqMock = vi.fn(() => ({ select: updateBranchSelectMock }));
const updateBranchMock = vi.fn((v: unknown) => {
  void v;
  return { eq: updateBranchEqMock };
});
const deleteBranchSelectMock = vi.fn(() => Promise.resolve(deleteBranchResult));
const deleteBranchEqMock = vi.fn(() => ({ select: deleteBranchSelectMock }));
const deleteBranchMock = vi.fn(() => ({ eq: deleteBranchEqMock }));
const branchSelectMock = vi.fn((cols: string) => ({
  eq: () => ({
    single: () => Promise.resolve(cols === "*" ? branchStarRow : beforeBranchRow),
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
    from: (table: string) => {
      // deleteBranch reads the full row for the audit before-image with the
      // service-role client (0031's column grant blocks select("*") for the
      // user client).
      if (table === "branches") return { select: (cols: string) => branchSelectMock(cols) };
      return { insert: (v: unknown) => auditInsertMock(v) };
    },
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
  branchStarRow.data = { id: "b1", nama: "Kantor Lama", alamat: "Jl. Lama", lat: 0, long: 0 };
  updateBranchResult.data = [{ id: "b1" }];
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
  updateBranchSelectMock.mockClear();
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

  it("revalidates every dependent settings path after a successful create", async () => {
    await createBranch(validFd());
    for (const p of [
      "/pengaturan/cabang",
      "/pengaturan/lokasi",
      "/pengaturan/jadwal",
      "/pengaturan/departemen",
    ]) {
      expect(revalidatePath).toHaveBeenCalledWith(p);
    }
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
    expect(updateBranchSelectMock).toHaveBeenCalledWith("id");
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

  it("returns the not-authorized message when the update matches no rows", async () => {
    updateBranchResult.data = [];
    const r = await updateBranch("b1", validFd());
    expect(r).toEqual({
      ok: false,
      error: "Gagal menyimpan perubahan cabang atau Anda tidak berhak.",
    });
    expect(auditInsertMock).not.toHaveBeenCalled();
  });
});

describe("deleteBranch", () => {
  it("rejects a non-admin caller with \"Tidak diizinkan.\" and does not delete", async () => {
    state.role = "karyawan";
    const r = await deleteBranch("b1");
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(deleteBranchMock).not.toHaveBeenCalled();
  });

  it("rejects a blank branchId with \"Cabang tidak valid.\"", async () => {
    const r = await deleteBranch("");
    expect(r).toEqual({ ok: false, error: "Cabang tidak valid." });
    expect(deleteBranchMock).not.toHaveBeenCalled();
  });

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

  it("lists every blocker joined with \", \" when more than one is non-zero", async () => {
    empCount.count = 3;
    payCount.count = 1;
    const r = await deleteBranch("b1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("3 karyawan");
      expect(r.error).toContain("1 periode payroll");
      expect(r.error).toContain("3 karyawan, 1 periode payroll");
    }
    expect(deleteBranchMock).not.toHaveBeenCalled();
  });

  it("deletes the branch by id and writes a branch_deleted audit row with the captured row", async () => {
    const r = await deleteBranch("b1");
    expect(r).toEqual({ ok: true });
    expect(deleteBranchEqMock).toHaveBeenCalledWith("id", "b1");
    expect(deleteBranchSelectMock).toHaveBeenCalledWith("id");
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "u1",
        target_employee_id: null,
        aksi: "branch_deleted",
        detail: expect.objectContaining({
          branch_id: "b1",
          before: expect.objectContaining({ nama: "Kantor Lama" }),
        }),
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
