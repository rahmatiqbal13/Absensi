"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateScheduleInput } from "@/lib/schedule/validate-schedule";
import { loadSchedules } from "@/lib/schedule/resolve";

type Result = { ok: true } | { ok: false; error: string };

async function authorizedDb() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return null;
  return db;
}

/**
 * Saves a branch's default schedule (`departmentId` null) or one department's
 * own schedule. Employees of a department without its own schedule follow the
 * branch default.
 */
export async function saveSchedule(
  branchId: string,
  departmentId: string | null,
  formData: FormData,
): Promise<Result> {
  const db = await authorizedDb();
  if (!db) return { ok: false, error: "Tidak diizinkan." };
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  if (departmentId) {
    const { data: dept, error: deptErr } = await db
      .from("departments")
      .select("branch_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (deptErr) {
      console.error("saveSchedule: department lookup failed", deptErr);
      return { ok: false, error: "Gagal menyimpan jadwal kerja." };
    }
    if (!dept || dept.branch_id !== branchId) return { ok: false, error: "Departemen tidak valid." };
  }

  const parsed = validateScheduleInput({
    jamMasuk: formData.get("jamMasuk"),
    jamPulang: formData.get("jamPulang"),
    hariKerja: formData.getAll("hariKerja"),
    toleransiMenit: formData.get("toleransiMenit"),
  });
  if (!parsed.ok) return parsed;

  const values = {
    jam_masuk: parsed.value.jamMasuk,
    jam_pulang: parsed.value.jamPulang,
    hari_kerja: parsed.value.hariKerja,
    toleransi_terlambat_menit: parsed.value.toleransiMenit,
    potong_terlambat: formData.get("potongTerlambat") === "on",
  };

  // Update-or-insert by hand: the uniqueness rules are partial indexes
  // (migration 0034), which PostgREST's upsert cannot target.
  const existing = await loadSchedules<{ id: string }>(db, "id", [branchId]);
  if (existing.error) {
    console.error("saveSchedule: existing lookup failed", existing.error);
    return { ok: false, error: "Gagal menyimpan jadwal kerja." };
  }
  const current = existing.data.find((s) => s.department_id === departmentId);

  const { error } = current
    ? await db.from("work_schedules").update(values).eq("id", current.id)
    : await db
        .from("work_schedules")
        .insert({ ...values, branch_id: branchId, ...(departmentId ? { department_id: departmentId } : {}) });
  if (error) {
    console.error("saveSchedule: write failed", error);
    return { ok: false, error: "Gagal menyimpan jadwal kerja." };
  }

  revalidatePath("/pengaturan/jadwal");
  revalidatePath("/pengaturan/cabang");
  return { ok: true };
}

/** Drops a department's own schedule; its employees go back to the branch default. */
export async function removeDepartmentSchedule(departmentId: string): Promise<Result> {
  const db = await authorizedDb();
  if (!db) return { ok: false, error: "Tidak diizinkan." };
  if (!departmentId) return { ok: false, error: "Departemen tidak valid." };

  const { error } = await db.from("work_schedules").delete().eq("department_id", departmentId);
  if (error) {
    console.error("removeDepartmentSchedule: delete failed", error);
    return { ok: false, error: "Gagal menghapus jadwal departemen." };
  }
  revalidatePath("/pengaturan/jadwal");
  return { ok: true };
}
