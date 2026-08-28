"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

type Result = { ok: true } | { ok: false; error: string };

async function assertHrAdmin() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { db, denied: { ok: false as const, error: "Tidak diizinkan." } };
  }
  return { db, denied: null };
}

export async function addDepartment(formData: FormData): Promise<Result> {
  const { db, denied } = await assertHrAdmin();
  if (denied) return denied;

  const nama = String(formData.get("nama") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "").trim();
  if (!nama || !branchId) {
    return { ok: false, error: "Nama departemen dan cabang wajib diisi." };
  }
  const { error } = await db.from("departments").insert({ nama, branch_id: branchId });
  if (error) {
    console.error("addDepartment: insert failed", error);
    return { ok: false, error: "Gagal menambah departemen." };
  }
  revalidatePath("/pengaturan/departemen");
  return { ok: true };
}

export async function deleteDepartment(id: string): Promise<Result> {
  const { db, denied } = await assertHrAdmin();
  if (denied) return denied;

  const { count, error: countErr } = await db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("department_id", id);
  if (countErr) {
    console.error("deleteDepartment: member count failed", countErr);
    return { ok: false, error: "Gagal menghapus departemen." };
  }
  if (count && count > 0) {
    return {
      ok: false,
      error: `Departemen masih dipakai ${count} karyawan. Pindahkan mereka dulu.`,
    };
  }

  const { data, error } = await db.from("departments").delete().eq("id", id).select("id");
  if (error) {
    console.error("deleteDepartment: delete failed", error);
    return { ok: false, error: "Gagal menghapus departemen." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Gagal menghapus departemen atau Anda tidak berhak." };
  }
  revalidatePath("/pengaturan/departemen");
  return { ok: true };
}
