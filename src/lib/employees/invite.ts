import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/route-access";
import { appUrl } from "@/lib/app-url";

export type InviteEmployeeInput = {
  nama: string;
  /** null: no login yet (machine-only employee); HR adds the email later. */
  email: string | null;
  jabatan: string;
  statusKontrak: string;
  statusPtkp?: string;
  tanggalMulaiKerja: string;
  gajiPokok: number;
  role: Role;
  branchId: string;
  departmentId: string | null;
  atasanId: string | null;
  designatedApproverId: string | null;
};

export type InviteEmployeeResult =
  | { ok: true; employeeId: string; setPasswordUrl: string | null }
  | { ok: false; error: string };


/** Auth address for an employee without email: unique, never deliverable (RFC 2606 .invalid). */
export const placeholderEmail = () => `tanpa-email-${randomUUID()}@tapabsen.invalid`;

export async function inviteEmployee(
  input: InviteEmployeeInput,
  db: SupabaseClient, // service-role
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

  let authUserId: string | undefined;
  let tokenHash: string | undefined;
  if (input.email) {
    const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
      type: "invite",
      email: input.email,
      options: { redirectTo: `${appUrl()}/set-password` },
    });
    authUserId = linkData?.user?.id;
    tokenHash = linkData?.properties?.hashed_token;
    if (linkErr || !authUserId || !tokenHash) {
      console.error("inviteEmployee: generateLink failed", linkErr);
      return { ok: false, error: "Gagal membuat akun karyawan." };
    }
  } else {
    // employees.id must be an auth user. Without an email the account gets an
    // internal address nobody can receive mail at and no password, so it cannot
    // sign in until HR sets a real email (updateEmployee) and sends a link.
    const { data, error } = await db.auth.admin.createUser({
      email: placeholderEmail(),
      email_confirm: true,
      user_metadata: { tanpa_email: true },
    });
    authUserId = data?.user?.id;
    if (error || !authUserId) {
      console.error("inviteEmployee: createUser (tanpa email) failed", error);
      return { ok: false, error: "Gagal membuat akun karyawan." };
    }
  }

  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .insert({
      id: authUserId,
      nama: input.nama,
      email: input.email,
      branch_id: input.branchId,
      department_id: input.departmentId,
      atasan_id: input.atasanId,
      designated_approver_id: input.designatedApproverId,
      jabatan: input.jabatan,
      status_kontrak: input.statusKontrak,
      ...(input.statusPtkp ? { status_ptkp: input.statusPtkp } : {}),
      tanggal_mulai_kerja: input.tanggalMulaiKerja,
      gaji_pokok: input.gajiPokok,
      role: input.role,
    })
    .select()
    .single();

  if (employeeErr || !employee) {
    console.error("inviteEmployee: employees insert failed", employeeErr);
    const { error: delErr } = await db.auth.admin.deleteUser(authUserId);
    if (delErr) {
      console.error(
        `inviteEmployee: failed to roll back auth user ${authUserId} after employees insert failed:`,
        delErr.message,
      );
    }
    return { ok: false, error: "Gagal menyimpan data karyawan." };
  }

  // Link on our own domain instead of Supabase's /auth/v1/verify action_link:
  // shorter, independent of the Supabase redirect allowlist, and the token is
  // only redeemed by JS on the page — chat-app link previews (which fetch the
  // URL but don't run JS) can't burn it the way they burn a /verify link.
  const setPasswordUrl = tokenHash ? `${appUrl()}/set-password?t=${encodeURIComponent(tokenHash)}` : null;
  return { ok: true, employeeId: employee.id, setPasswordUrl };
}
