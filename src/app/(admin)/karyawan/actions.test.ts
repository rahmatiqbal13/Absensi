import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const from = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: "actor-1" } } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ from, auth: { getUser } })),
  createServiceRoleSupabaseClient: vi.fn(() => ({ _service: true })),
}));
const inviteEmployee = vi.fn();
vi.mock("@/lib/employees/invite", () => ({ inviteEmployee: (...a: unknown[]) => inviteEmployee(...a) }));

import { createEmployee, updateEmployee, setEmployeeStatus } from "./actions";

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

beforeEach(() => { from.mockReset(); inviteEmployee.mockReset(); getUser.mockClear(); });

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
});

describe("updateEmployee", () => {
  it("maps the protected-field trigger error", async () => {
    from.mockReturnValue({ update: () => ({ eq: async () => ({ error: { message: "not allowed to change protected employee fields" } }) }) });
    const result = await updateEmployee("e1", fd(validForm));
    expect(result).toEqual({ ok: false, error: "Anda tidak berhak mengubah data terproteksi karyawan." });
  });

  it("succeeds on a clean update", async () => {
    from.mockReturnValue({ update: () => ({ eq: async () => ({ error: null }) }) });
    const result = await updateEmployee("e1", fd(validForm));
    expect(result).toEqual({ ok: true });
  });
});

describe("setEmployeeStatus", () => {
  it("refuses to deactivate yourself", async () => {
    const result = await setEmployeeStatus("actor-1", "nonaktif");
    expect(result).toEqual({ ok: false, error: "Anda tidak dapat menonaktifkan akun Anda sendiri." });
  });

  it("updates status for another employee", async () => {
    from.mockReturnValue({ update: () => ({ eq: async () => ({ error: null }) }) });
    const result = await setEmployeeStatus("e2", "nonaktif");
    expect(result).toEqual({ ok: true });
  });
});
