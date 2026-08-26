import type { SupabaseClient } from "@supabase/supabase-js";

export type InviteEmployeeInput = {
  nama: string;
  email: string;
  branchId: string;
  departmentId?: string;
  atasanId?: string;
  designatedApproverId?: string;
  jabatan: string;
  statusKontrak: string;
  tanggalMulaiKerja: string;
  gajiPokok: number;
  role: "karyawan" | "atasan" | "hr_admin" | "super_admin";
};

export type InviteEmployeeResult =
  | { ok: true; employeeId: string }
  | { ok: false; error: string };

export async function inviteEmployee(
  input: InviteEmployeeInput,
  db: SupabaseClient,
): Promise<InviteEmployeeResult> {
  if (
    (input.role === "hr_admin" || input.role === "super_admin") &&
    !input.designatedApproverId
  ) {
    return {
      ok: false,
      error: "designatedApproverId is required for hr_admin and super_admin roles",
    };
  }

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
  });
  if (authErr || !authUser.user) {
    return { ok: false, error: authErr?.message ?? "failed to create auth user" };
  }

  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .insert({
      id: authUser.user.id,
      nama: input.nama,
      email: input.email,
      branch_id: input.branchId,
      department_id: input.departmentId ?? null,
      atasan_id: input.atasanId ?? null,
      designated_approver_id: input.designatedApproverId ?? null,
      jabatan: input.jabatan,
      status_kontrak: input.statusKontrak,
      tanggal_mulai_kerja: input.tanggalMulaiKerja,
      gaji_pokok: input.gajiPokok,
      role: input.role,
    })
    .select()
    .single();

  if (employeeErr || !employee) {
    const { error: deleteErr } = await db.auth.admin.deleteUser(authUser.user.id);
    if (deleteErr) {
      console.error(
        `inviteEmployee: failed to roll back auth user ${authUser.user.id} after employees insert failed:`,
        deleteErr.message,
      );
    }
    return { ok: false, error: employeeErr?.message ?? "failed to create employee record" };
  }

  return { ok: true, employeeId: employee.id };
}
