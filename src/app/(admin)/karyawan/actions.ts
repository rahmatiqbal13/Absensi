"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateEmployeeInput } from "@/lib/employees/employee-form";
import { inviteEmployee } from "@/lib/employees/invite";
import { countActiveSuperAdmins } from "@/lib/employees/super-admin-count";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Known `inviteEmployee` error strings mapped to fixed UI copy. Anything not
// listed here is treated as unexpected and collapsed to a generic message so a
// raw DB error string can never reach the user.
const INVITE_ERROR_MESSAGES: Record<string, string> = {
  "designatedApproverId is required for hr_admin and super_admin roles":
    "Approver pengganti wajib untuk role HR Admin / Super Admin.",
  "Gagal membuat akun karyawan.": "Gagal membuat akun karyawan.",
  "Gagal menyimpan data karyawan.": "Gagal menyimpan data karyawan.",
};

const LAST_SUPER_ADMIN_DEACTIVATE =
  "Tidak dapat menonaktifkan Super Admin terakhir — sistem butuh minimal 2.";
const LAST_SUPER_ADMIN_DEMOTE =
  "Tidak dapat menurunkan peran Super Admin terakhir — sistem butuh minimal 2.";

async function assertHrAdmin(): Promise<{ ok: false; error: string } | null> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  return null;
}

function formRecord(formData: FormData): Record<string, FormDataEntryValue | null> {
  const rec: Record<string, FormDataEntryValue | null> = {};
  for (const [k, v] of formData.entries()) rec[k] = v;
  return rec;
}

export async function createEmployee(
  formData: FormData,
): Promise<Result<{ setPasswordUrl: string }>> {
  const denied = await assertHrAdmin();
  if (denied) return denied;

  const parsed = validateEmployeeInput(formRecord(formData));
  if (!parsed.ok) return parsed;

  const result = await inviteEmployee(
    {
      nama: parsed.value.nama,
      email: parsed.value.email,
      jabatan: parsed.value.jabatan,
      statusKontrak: parsed.value.statusKontrak,
      tanggalMulaiKerja: parsed.value.tanggalMulaiKerja,
      gajiPokok: parsed.value.gajiPokok,
      role: parsed.value.role,
      branchId: parsed.value.branchId,
      departmentId: parsed.value.departmentId,
      atasanId: parsed.value.atasanId,
      designatedApproverId: parsed.value.designatedApproverId,
    },
    createServiceRoleSupabaseClient(),
  );
  if (!result.ok) {
    console.error("createEmployee: invite failed", result.error);
    return { ok: false, error: INVITE_ERROR_MESSAGES[result.error] ?? "Gagal membuat karyawan." };
  }
  revalidatePath("/karyawan");
  return { ok: true, setPasswordUrl: result.setPasswordUrl };
}

const UPDATE_ERROR_MESSAGES: Record<string, string> = {
  "not allowed to change protected employee fields":
    "Anda tidak berhak mengubah data terproteksi karyawan.",
  "not allowed to change protected fields on own employee record":
    "Anda tidak berhak mengubah data terproteksi karyawan.",
};

export async function updateEmployee(id: string, formData: FormData): Promise<Result> {
  const denied = await assertHrAdmin();
  if (denied) return denied;

  const parsed = validateEmployeeInput(formRecord(formData));
  if (!parsed.ok) return parsed;

  const db = await createServerSupabaseClient();

  const { data: target } = await db
    .from("employees")
    .select("role")
    .eq("id", id)
    .single();
  if (
    target?.role === "super_admin" &&
    parsed.value.role !== "super_admin"
  ) {
    const count = await countActiveSuperAdmins(db);
    if (count !== null && count <= 2) {
      return { ok: false, error: LAST_SUPER_ADMIN_DEMOTE };
    }
  }

  const { error } = await db
    .from("employees")
    .update({
      nama: parsed.value.nama,
      jabatan: parsed.value.jabatan,
      status_kontrak: parsed.value.statusKontrak,
      tanggal_mulai_kerja: parsed.value.tanggalMulaiKerja,
      gaji_pokok: parsed.value.gajiPokok,
      role: parsed.value.role,
      branch_id: parsed.value.branchId,
      department_id: parsed.value.departmentId,
      atasan_id: parsed.value.atasanId,
      designated_approver_id: parsed.value.designatedApproverId,
    })
    .eq("id", id);

  if (error) {
    for (const [key, friendly] of Object.entries(UPDATE_ERROR_MESSAGES)) {
      if (error.message.includes(key)) return { ok: false, error: friendly };
    }
    console.error("updateEmployee: update failed", error);
    return { ok: false, error: "Gagal menyimpan perubahan karyawan." };
  }
  revalidatePath(`/karyawan/${id}`);
  revalidatePath("/karyawan");
  return { ok: true };
}

export async function setEmployeeStatus(
  id: string,
  status: "aktif" | "nonaktif",
): Promise<Result> {
  const denied = await assertHrAdmin();
  if (denied) return denied;

  const db = await createServerSupabaseClient();
  const { data: userData } = await db.auth.getUser();
  if (status === "nonaktif" && userData.user?.id === id) {
    return { ok: false, error: "Anda tidak dapat menonaktifkan akun Anda sendiri." };
  }

  if (status === "nonaktif") {
    const { data: target } = await db
      .from("employees")
      .select("role")
      .eq("id", id)
      .single();
    if (target?.role === "super_admin") {
      const count = await countActiveSuperAdmins(db);
      if (count !== null && count <= 2) {
        return { ok: false, error: LAST_SUPER_ADMIN_DEACTIVATE };
      }
    }
  }

  const { error } = await db.from("employees").update({ status }).eq("id", id);
  if (error) {
    console.error("setEmployeeStatus: update failed", error);
    return { ok: false, error: "Gagal mengubah status karyawan." };
  }
  revalidatePath(`/karyawan/${id}`);
  revalidatePath("/karyawan");
  return { ok: true };
}
