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
    hitung_lembur: formData.get("hitungLembur") === "on",
  };

  // Update-or-insert by hand: the uniqueness rules are partial indexes
  // (migration 0034), which PostgREST's upsert cannot target.
  const existing = await loadSchedules<{ id: string }>(db, "id", [branchId]);
  if (existing.error) {
    console.error("saveSchedule: existing lookup failed", existing.error);
    return { ok: false, error: "Gagal menyimpan jadwal kerja." };
  }
  // Jadwal khusus rows (named, 0065) are never a branch default.
  const current = existing.data.find((s) => s.department_id === departmentId && !s.nama);

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

/**
 * Creates (`scheduleId` null) or updates a jadwal khusus: a named schedule of a
 * branch that HR assigns to individual employees (migration 0065).
 */
export async function saveCustomSchedule(branchId: string, scheduleId: string | null, formData: FormData): Promise<Result> {
  const db = await authorizedDb();
  if (!db) return { ok: false, error: "Tidak diizinkan." };
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) return { ok: false, error: "Beri nama jadwal khusus, mis. \"Pagi Lab\"." };
  if (nama.length > 60) return { ok: false, error: "Nama jadwal maksimal 60 karakter." };

  const parsed = validateScheduleInput({
    jamMasuk: formData.get("jamMasuk"),
    jamPulang: formData.get("jamPulang"),
    hariKerja: formData.getAll("hariKerja"),
    toleransiMenit: formData.get("toleransiMenit"),
  });
  if (!parsed.ok) return parsed;

  const values = {
    nama,
    jam_masuk: parsed.value.jamMasuk,
    jam_pulang: parsed.value.jamPulang,
    hari_kerja: parsed.value.hariKerja,
    toleransi_terlambat_menit: parsed.value.toleransiMenit,
    potong_terlambat: formData.get("potongTerlambat") === "on",
    hitung_lembur: formData.get("hitungLembur") === "on",
  };
  const { error } = scheduleId
    ? await db.from("work_schedules").update(values).eq("id", scheduleId).eq("branch_id", branchId).not("nama", "is", null)
    : await db.from("work_schedules").insert({ ...values, branch_id: branchId });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `Nama "${nama}" sudah dipakai di cabang ini.` };
    if (error.code === "42703") return { ok: false, error: "Fitur ini butuh migrasi 0065_employee_work_schedules.sql." };
    console.error("saveCustomSchedule: write failed", error);
    return { ok: false, error: "Gagal menyimpan jadwal khusus." };
  }
  revalidatePath("/pengaturan/jadwal");
  return { ok: true };
}

/** Deletes a jadwal khusus; its employees go back to their department / branch schedule. */
export async function deleteCustomSchedule(scheduleId: string): Promise<Result> {
  const db = await authorizedDb();
  if (!db) return { ok: false, error: "Tidak diizinkan." };
  const { data, error } = await db.from("work_schedules").delete().eq("id", scheduleId).not("nama", "is", null).select("id");
  if (error || !data?.length) {
    if (error) console.error("deleteCustomSchedule: delete failed", error);
    return { ok: false, error: "Gagal menghapus jadwal khusus." };
  }
  revalidatePath("/pengaturan/jadwal");
  return { ok: true };
}

/**
 * Sets exactly who follows a jadwal khusus: `employeeIds` get it, everyone else
 * who had it goes back to their department / branch schedule. Someone moved
 * here from another jadwal khusus leaves that one (one jadwal khusus each).
 */
export async function setCustomScheduleMembers(scheduleId: string, employeeIds: string[]): Promise<Result> {
  const db = await authorizedDb();
  if (!db) return { ok: false, error: "Tidak diizinkan." };
  const { data: sched, error: schedErr } = await db
    .from("work_schedules")
    .select("id, branch_id, nama")
    .eq("id", scheduleId)
    .maybeSingle();
  if (schedErr || !sched?.nama) return { ok: false, error: "Jadwal khusus tidak ditemukan." };

  // Ids go into a PostgREST filter string: accept UUIDs only.
  const ids = [...new Set(employeeIds)].filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const { error: clearErr } = await db
    .from("employees")
    .update({ work_schedule_id: null })
    .eq("work_schedule_id", scheduleId)
    .not("id", "in", `(${ids.length ? ids.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  if (clearErr) {
    console.error("setCustomScheduleMembers: clear failed", clearErr);
    return { ok: false, error: "Gagal menyimpan pegawai jadwal khusus." };
  }
  if (ids.length) {
    const { error } = await db
      .from("employees")
      .update({ work_schedule_id: scheduleId })
      .in("id", ids)
      .eq("branch_id", sched.branch_id);
    if (error) {
      console.error("setCustomScheduleMembers: assign failed", error);
      return { ok: false, error: "Gagal menyimpan pegawai jadwal khusus." };
    }
  }
  revalidatePath("/pengaturan/jadwal");
  revalidatePath("/laporan");
  return { ok: true };
}
