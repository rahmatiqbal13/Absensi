import { describe, it, expect, vi } from "vitest";
import { inviteEmployee } from "./invite";

const APP_URL = "https://app.example.test";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const baseInput = {
  nama: "Sari",
  email: "sari@contoh.co.id",
  jabatan: "Staff",
  statusKontrak: "tetap",
  tanggalMulaiKerja: "2026-02-01",
  gajiPokok: 8_000_000,
  role: "karyawan" as const,
  branchId: "11111111-1111-1111-1111-111111111111",
  departmentId: null,
  atasanId: null,
  designatedApproverId: null,
};

function makeDb(opts: { linkError?: string; insertError?: string; deleteError?: string } = {}) {
  const generateLink = vi.fn(async () =>
    opts.linkError
      ? { data: { user: null, properties: null }, error: { message: opts.linkError } }
      : {
          data: {
            user: { id: "auth-user-1" },
            properties: { action_link: `${APP_URL}/set-password#access_token=xyz` },
          },
          error: null,
        },
  );
  const deleteUser = vi.fn(async () =>
    opts.deleteError ? { data: null, error: { message: opts.deleteError } } : { data: {}, error: null },
  );
  const single = vi.fn(async () =>
    opts.insertError
      ? { data: null, error: { message: opts.insertError } }
      : { data: { id: "auth-user-1" }, error: null },
  );
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  return {
    _generateLink: generateLink,
    _deleteUser: deleteUser,
    _insert: insert,
    auth: { admin: { generateLink, deleteUser } },
    from: vi.fn(() => ({ insert })),
  };
}

describe("inviteEmployee", () => {
  it("creates the auth user + employees row and returns a set-password link", async () => {
    const db = makeDb();
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({
      ok: true,
      employeeId: "auth-user-1",
      setPasswordUrl: `${APP_URL}/set-password#access_token=xyz`,
    });
    expect(db._generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invite", email: "sari@contoh.co.id" }),
    );
    expect(db._insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "auth-user-1", email: "sari@contoh.co.id", role: "karyawan" }),
    );
  });

  it("rejects hr_admin without a designated approver before touching auth", async () => {
    const db = makeDb();
    const result = await inviteEmployee({ ...baseInput, role: "hr_admin" }, db as any);
    expect(result).toEqual({ ok: false, error: "designatedApproverId is required for hr_admin and super_admin roles" });
    expect(db._generateLink).not.toHaveBeenCalled();
  });

  it("returns a fixed error and does not insert when generateLink fails", async () => {
    const db = makeDb({ linkError: "boom" });
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: false, error: "Gagal membuat akun karyawan." });
    expect(db._insert).not.toHaveBeenCalled();
  });

  it("rolls back the auth user when the employees insert fails", async () => {
    const db = makeDb({ insertError: "duplicate key" });
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: false, error: "Gagal menyimpan data karyawan." });
    expect(db._deleteUser).toHaveBeenCalledWith("auth-user-1");
  });
});
