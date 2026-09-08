import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { role: string | null } = { role: "super_admin" };
const beforeRow: { data: unknown; error: unknown } = {
  data: { lat: -6.1, long: 106.8, radius_geofencing_meter: 100 },
  error: null,
};
const updateResult: { error: unknown } = { error: null };
const auditResult: { error: unknown } = { error: null };

const updateMock = vi.fn((_v?: unknown) => ({ eq: () => Promise.resolve(updateResult) }));
const beforeSelectMock = vi.fn(() => Promise.resolve(beforeRow));
const auditInsertMock = vi.fn((_v?: unknown) => Promise.resolve(auditResult));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({
      update: (v: unknown) => updateMock(v),
      select: () => ({ eq: () => ({ single: () => beforeSelectMock() }) }),
    }),
  }),
  createServiceRoleSupabaseClient: () => ({
    from: () => ({ insert: (v: unknown) => auditInsertMock(v) }),
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentEmployee: async () => (state.role ? { id: "u1", role: state.role } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveBranchLocation } from "./actions";
import { revalidatePath } from "next/cache";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validFd = () => fd({ lat: "-6.2", long: "106.816", radius: "120" });

beforeEach(() => {
  state.role = "super_admin";
  beforeRow.data = { lat: -6.1, long: 106.8, radius_geofencing_meter: 100 };
  beforeRow.error = null;
  updateResult.error = null;
  auditResult.error = null;
  updateMock.mockClear();
  beforeSelectMock.mockClear();
  auditInsertMock.mockClear();
  vi.mocked(revalidatePath).mockClear();
});

describe("saveBranchLocation", () => {
  it("rejects a non-admin caller with \"Tidak diizinkan.\"", async () => {
    state.role = "karyawan";
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an empty branchId with \"Cabang tidak valid.\"", async () => {
    const r = await saveBranchLocation("", validFd());
    expect(r).toEqual({ ok: false, error: "Cabang tidak valid." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid coordinates (delegates to validateLocationInput)", async () => {
    const r = await saveBranchLocation("b1", fd({ lat: "999", long: "106.816", radius: "120" }));
    expect(r).toEqual({ ok: false, error: "Latitude tidak valid." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("updates branches and writes a branch_location_update audit row on valid input", async () => {
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ lat: -6.2, long: 106.816, radius_geofencing_meter: 120 }),
    );
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "u1",
        target_employee_id: null,
        aksi: "branch_location_update",
        detail: expect.objectContaining({
          branch_id: "b1",
          before: { lat: -6.1, long: 106.8, radius_geofencing_meter: 100 },
          after: { lat: -6.2, long: 106.816, radius_geofencing_meter: 120 },
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/pengaturan/lokasi");
    expect(revalidatePath).toHaveBeenCalledWith("/absen");
  });

  it("lets an hr_admin caller through to the success path", async () => {
    state.role = "hr_admin";
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ lat: -6.2, long: 106.816, radius_geofencing_meter: 120 }),
    );
  });

  it("still returns { ok: true } when the audit insert errors", async () => {
    auditResult.error = { message: "rls denied" };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns an Indonesian error when the branches.update errors", async () => {
    updateResult.error = { message: "boom" };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: false, error: "Gagal menyimpan lokasi kantor." });
    expect(auditInsertMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
