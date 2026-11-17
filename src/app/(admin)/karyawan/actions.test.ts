import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const from = vi.fn();
const auditInsert = vi.fn(async (_row: unknown) => ({ error: null }));
const serviceFrom = vi.fn((_table: string) => ({ insert: auditInsert }));
const getUser = vi.fn(async () => ({ data: { user: { id: "actor-1" } } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ from, auth: { getUser } })),
  createServiceRoleSupabaseClient: vi.fn(() => ({ _service: true, from: serviceFrom })),
}));
const inviteEmployee = vi.fn();
vi.mock("@/lib/employees/invite", () => ({ inviteEmployee: (...a: unknown[]) => inviteEmployee(...a) }));
const countActiveSuperAdmins = vi.fn(async (..._a: unknown[]): Promise<number | null> => 5);
vi.mock("@/lib/employees/super-admin-count", () => ({
  countActiveSuperAdmins: (...a: unknown[]) => countActiveSuperAdmins(...a),
}));

const createRecoveryLink = vi.fn();
vi.mock("@/lib/auth/password-reset", () => ({
  createRecoveryLink: (...a: unknown[]) => createRecoveryLink(...a),
}));

import { createEmployee, updateEmployee, setEmployeeStatus, createPasswordResetLink } from "./actions";

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}
const validForm = {
  nama: "Budi", email: "budi@x.co", jabatan: "Staff", statusKontrak: "tetap",
  tanggalMulaiKerja: "2026-02-01", gajiPokok: "8000000", role: "karyawan",
  branchId: "11111111-1111-1111-1111-111111111111", departmentId: "", atasanId: "", designatedApproverId: "",
};

const HR_ADMIN = { id: "actor-1", nama: "HR", email: "hr@x", role: "hr_admin", branch_id: "b1", status: "aktif" };

// The hr_admin gate calls getCurrentEmployee → from("employees").select().eq().single().
// updateEmployee / setEmployeeStatus then do a second employees.select().eq().single() to read
// the target's current role. `single()` returns gateRow on the first call, targetRow after.
// Per-test overrides pass `mutation` for the .update().eq() (or .insert()) chain.
function mockFrom(opts: { gateRow?: unknown; targetRow?: unknown; mutation?: unknown } = {}) {
  const gateRow = "gateRow" in opts ? opts.gateRow : HR_ADMIN;
  const targetRow = "targetRow" in opts ? opts.targetRow : gateRow;
  let calls = 0;
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => {
          calls += 1;
          return { data: calls === 1 ? gateRow : targetRow, error: null };
        },
      }),
    }),
    ...(opts.mutation as object ?? { update: () => ({ eq: async () => ({ error: null }) }) }),
  });
}

beforeEach(() => {
  from.mockReset();
  inviteEmployee.mockReset();
  getUser.mockClear();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  countActiveSuperAdmins.mockClear();
  countActiveSuperAdmins.mockResolvedValue(5);
  mockFrom();
});

describe("createEmployee", () => {
  it("validates, invites with a service-role client, and returns the link", async () => {
    inviteEmployee.mockResolvedValue({ ok: true, employeeId: "e1", setPasswordUrl: "https://app/set-password#x" });
    const result = await createEmployee(fd(validForm));
    expect(result).toEqual({ ok: true, setPasswordUrl: "https://app/set-password#x" });
    expect(inviteEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ nama: "Budi", role: "karyawan", gajiPokok: 8_000_000 }),
      expect.objectContaining({ _service: true }),
    );
  });

  it("returns the validation error without inviting", async () => {
    const result = await createEmployee(fd({ ...validForm, email: "nope" }));
    expect(result).toEqual({ ok: false, error: "Format email tidak valid." });
    expect(inviteEmployee).not.toHaveBeenCalled();
  });

  it("maps an invite failure to a fixed message", async () => {
    inviteEmployee.mockResolvedValue({ ok: false, error: "Gagal menyimpan data karyawan." });
    const result = await createEmployee(fd(validForm));
    expect(result).toEqual({ ok: false, error: "Gagal menyimpan data karyawan." });
  });

  it("refuses a caller who is not hr_admin and never invites", async () => {
    mockFrom({ gateRow: { ...HR_ADMIN, role: "atasan" } });
    const result = await createEmployee(fd(validForm));
    expect(result).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(inviteEmployee).not.toHaveBeenCalled();
  });
});

describe("updateEmployee", () => {
  it("maps the protected-field trigger error", async () => {
    mockFrom({ mutation: { update: () => ({ eq: async () => ({ error: { message: "not allowed to change protected employee fields" } }) }) } });
    const result = await updateEmployee("e1", fd(validForm));
    expect(result).toEqual({ ok: false, error: "Anda tidak berhak mengubah data terproteksi karyawan." });
  });

  it("succeeds on a clean update", async () => {
    const result = await updateEmployee("e1", fd(validForm));
    expect(result).toEqual({ ok: true });
  });

  it("refuses to demote the last super_admin when only 2 remain", async () => {
    countActiveSuperAdmins.mockResolvedValue(2);
    mockFrom({ targetRow: { ...HR_ADMIN, role: "super_admin" } });
    const result = await updateEmployee("e1", fd({ ...validForm, role: "karyawan" }));
    expect(result).toEqual({
      ok: false,
      error: "Tidak dapat menurunkan peran Super Admin terakhir — sistem butuh minimal 2.",
    });
  });

  it("allows demoting a super_admin while others remain", async () => {
    countActiveSuperAdmins.mockResolvedValue(4);
    mockFrom({ targetRow: { ...HR_ADMIN, role: "super_admin" } });
    const result = await updateEmployee("e1", fd({ ...validForm, role: "karyawan" }));
    expect(result).toEqual({ ok: true });
  });
});

describe("setEmployeeStatus", () => {
  it("refuses to deactivate yourself", async () => {
    const result = await setEmployeeStatus("actor-1", "nonaktif");
    expect(result).toEqual({ ok: false, error: "Anda tidak dapat menonaktifkan akun Anda sendiri." });
  });

  it("updates status for another employee", async () => {
    const result = await setEmployeeStatus("e2", "nonaktif");
    expect(result).toEqual({ ok: true });
  });

  it("refuses to deactivate the last super_admin when only 2 remain", async () => {
    countActiveSuperAdmins.mockResolvedValue(2);
    mockFrom({ targetRow: { ...HR_ADMIN, role: "super_admin" } });
    const result = await setEmployeeStatus("e2", "nonaktif");
    expect(result).toEqual({
      ok: false,
      error: "Tidak dapat menonaktifkan Super Admin terakhir — sistem butuh minimal 2.",
    });
  });

  it("allows deactivating a super_admin while others remain", async () => {
    countActiveSuperAdmins.mockResolvedValue(4);
    mockFrom({ targetRow: { ...HR_ADMIN, role: "super_admin" } });
    const result = await setEmployeeStatus("e2", "nonaktif");
    expect(result).toEqual({ ok: true });
  });
});

describe("createPasswordResetLink", () => {
  it("returns the link for hr_admin and writes an audit row", async () => {
    createRecoveryLink.mockResolvedValue({ ok: true, url: "https://x/r", email: "b@x.co", nama: "B" });
    const result = await createPasswordResetLink("e1");
    expect(result).toEqual({ ok: true, url: "https://x/r" });
    expect(createRecoveryLink).toHaveBeenCalledWith(
      expect.objectContaining({ _service: true }),
      { employeeId: "e1" },
      { throttle: false },
    );
    expect(serviceFrom).toHaveBeenCalledWith("audit_logs");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: "actor-1", target_employee_id: "e1", aksi: "password_reset_link" }),
    );
  });

  it("refuses a non-HR caller without creating a link", async () => {
    createRecoveryLink.mockReset();
    mockFrom({ gateRow: { ...HR_ADMIN, role: "atasan" } });
    expect(await createPasswordResetLink("e1")).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(createRecoveryLink).not.toHaveBeenCalled();
  });

  it("explains why an inactive employee can't get a link", async () => {
    createRecoveryLink.mockResolvedValue({ ok: false, reason: "inactive" });
    const result = await createPasswordResetLink("e1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/nonaktif/i);
  });
});
