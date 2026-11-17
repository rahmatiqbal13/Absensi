import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/route-access";

export type InviteEmployeeInput = {
  nama: string;
  email: string;
  jabatan: string;
  statusKontrak: string;
  tanggalMulaiKerja: string;
  gajiPokok: number;
  role: Role;
  branchId: string;
  departmentId: string | null;
  atasanId: string | null;
  designatedApproverId: string | null;
};

export type InviteEmployeeResult =
  | { ok: true; employeeId: string; setPasswordUrl: string }
  | { ok: false; error: string };

// Explicit NEXT_PUBLIC_APP_URL wins; otherwise use the origin of the request
// that triggered the invite, so a deployed app never emits localhost links.
function appUrl(requestOrigin?: string): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    requestOrigin ||
    "http://localhost:3000"
  );
}

export async function inviteEmployee(
  input: InviteEmployeeInput,
  db: SupabaseClient, // service-role
  requestOrigin?: string,
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

  const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { redirectTo: `${appUrl(requestOrigin)}/set-password` },
  });
  const authUserId = linkData?.user?.id;
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !authUserId || !tokenHash) {
    console.error("inviteEmployee: generateLink failed", linkErr);
    return { ok: false, error: "Gagal membuat akun karyawan." };
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
  const setPasswordUrl = `${appUrl(requestOrigin)}/set-password?t=${encodeURIComponent(tokenHash)}`;
  return { ok: true, employeeId: employee.id, setPasswordUrl };
}
