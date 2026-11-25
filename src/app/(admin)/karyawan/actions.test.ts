import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const from = vi.fn();
const auditInsert = vi.fn(async (_row: unknown) => ({ error: null }));
// The reset-link target's role, read with the service client.
let serviceTarget: { role: string } | null = { role: "karyawan" };
const serviceFrom = vi.fn((_table: string) => ({
  insert: auditInsert,
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: serviceTarget, error: null }) }) }),
}));
const updateUserById = vi.fn(async (..._a: unknown[]) => ({ error: null }));
const getUser = vi.fn(async () => ({ data: { user: { id: "actor-1" } } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ from, auth: { getUser } })),
  createServiceRoleSupabaseClient: vi.fn(() => ({ _service: true, from: serviceFrom, auth: { admin: { updateUserById } } })),
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

// getCurrentEmployee (the caller) selects its own column list, including
// foto_profil_url → gateRow. Any other employees.select().eq().single() reads the
// target → targetRow. Per-test overrides pass `mutation` for .update().eq().
function mockFrom(opts: { gateRow?: unknown; targetRow?: unknown; mutation?: unknown } = {}) {
  const gateRow = "gateRow" in opts ? opts.gateRow : HR_ADMIN;
  const targetRow = "targetRow" in opts ? opts.targetRow : { ...HR_ADMIN, id: "e1", role: "karyawan" };
  from.mockReturnValue({
    select: (cols: string) => ({
      eq: () => ({
        single: async () => ({ data: cols.includes("foto_profil_url") ? gateRow : targetRow, error: null }),
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
  serviceTarget = { role: "karyawan" };
  updateUserById.mockClear();
  mockFrom();
});

const SUPER_ADMIN = { ...HR_ADMIN, role: "super_admin" };
const SUPER_ADMIN_ONLY = "Hanya Super Admin yang dapat memberi peran Super Admin atau mengubah akun Super Admin.";

describe("createEmployee", () => {
  it("refuses an HR admin creating a super admin", async () => {
    const result = await createEmployee(fd({ ...validForm, role: "super_admin", designatedApproverId: "22222222-2222-2222-2222-222222222222" }));
    expect(result).toEqual({ ok: false, error: SUPER_ADMIN_ONLY });
    expect(inviteEmployee).not.toHaveBeenCalled();
  });

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
    mockFrom({ gateRow: SUPER_ADMIN, targetRow: { ...HR_ADMIN, role: "super_admin" } });
    const result = await updateEmployee("e1", fd({ ...validForm, role: "karyawan" }));
    expect(result).toEqual({
      ok: false,
      error: "Tidak dapat menurunkan peran Super Admin terakhir — sistem butuh minimal 2.",
    });
  });

  it("allows demoting a super_admin while others remain", async () => {
    countActiveSuperAdmins.mockResolvedValue(4);
    mockFrom({ gateRow: SUPER_ADMIN, targetRow: { ...HR_ADMIN, role: "super_admin" } });
    const result = await updateEmployee("e1", fd({ ...validForm, role: "karyawan" }));
    expect(result).toEqual({ ok: true });
  });

  it("refuses an HR admin changing a super admin's account or granting the role", async () => {
    mockFrom({ targetRow: { ...HR_ADMIN, role: "super_admin" } });
    expect(await updateEmployee("e1", fd({ ...validForm, role: "super_admin", designatedApproverId: "22222222-2222-2222-2222-222222222222" }))).toEqual({ ok: false, error: SUPER_ADMIN_ONLY });
    mockFrom();
    expect(await updateEmployee("e1", fd({ ...validForm, role: "super_admin", designatedApproverId: "22222222-2222-2222-2222-222222222222" }))).toEqual({ ok: false, error: SUPER_ADMIN_ONLY });
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
    mockFrom({ gateRow: SUPER_ADMIN, targetRow: { ...HR_ADMIN, role: "super_admin" } });
    const result = await setEmployeeStatus("e2", "nonaktif");
    expect(result).toEqual({
      ok: false,
      error: "Tidak dapat menonaktifkan Super Admin terakhir — sistem butuh minimal 2.",
    });
  });

  it("allows deactivating a super_admin while others remain", async () => {
    countActiveSuperAdmins.mockResolvedValue(4);
    mockFrom({ gateRow: SUPER_ADMIN, targetRow: { ...HR_ADMIN, role: "super_admin" } });
    const result = await setEmployeeStatus("e2", "nonaktif");
    expect(result).toEqual({ ok: true });
  });

  it("refuses an HR admin deactivating a super admin", async () => {
    mockFrom({ targetRow: { ...HR_ADMIN, role: "super_admin" } });
    expect(await setEmployeeStatus("e2", "nonaktif")).toEqual({ ok: false, error: SUPER_ADMIN_ONLY });
  });

  it("bans the auth user on deactivation and lifts it on reactivation", async () => {
    await setEmployeeStatus("e2", "nonaktif");
    expect(updateUserById).toHaveBeenLastCalledWith("e2", { ban_duration: "876000h" });
    await setEmployeeStatus("e2", "aktif");
    expect(updateUserById).toHaveBeenLastCalledWith("e2", { ban_duration: "none" });
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

  it("refuses an HR admin a reset link for a super admin account", async () => {
    createRecoveryLink.mockReset();
    serviceTarget = { role: "super_admin" };
    expect(await createPasswordResetLink("e1")).toEqual({ ok: false, error: SUPER_ADMIN_ONLY });
    expect(createRecoveryLink).not.toHaveBeenCalled();
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
