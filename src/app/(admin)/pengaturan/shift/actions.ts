"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function hrOnly() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return { db, me: null };
  return { db, me };
}

export async function createShift(branchId: string, formData: FormData): Promise<Result> {
  const { db, me } = await hrOnly();
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  const nama = String(formData.get("nama") ?? "").trim().slice(0, 40);
  const masuk = String(formData.get("jam_masuk") ?? "");
  const pulang = String(formData.get("jam_pulang") ?? "");
  const toleransi = Number(formData.get("toleransi") ?? 0);
  if (!UUID_RE.test(branchId)) return { ok: false, error: "Cabang tidak valid." };
  if (!nama) return { ok: false, error: "Nama shift wajib diisi." };
  if (!TIME_RE.test(masuk) || !TIME_RE.test(pulang)) return { ok: false, error: "Isi jam masuk dan jam pulang." };
  if (pulang <= masuk) return { ok: false, error: "Jam pulang harus setelah jam masuk (shift lewat tengah malam belum didukung)." };
  if (!Number.isInteger(toleransi) || toleransi < 0 || toleransi > 180) return { ok: false, error: "Toleransi 0–180 menit." };
  const { error } = await db
    .from("shifts")
    .insert({ branch_id: branchId, nama, jam_masuk: masuk, jam_pulang: pulang, toleransi_terlambat_menit: toleransi });
  if (error) {
    console.error("createShift: insert failed", error);
    return { ok: false, error: error.code === "23505" ? "Nama shift sudah dipakai di cabang ini." : "Gagal menyimpan shift." };
  }
  revalidatePath("/pengaturan/shift");
  return { ok: true };
}

export async function deleteShift(id: string): Promise<Result> {
  const { db, me } = await hrOnly();
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  // Roster rows on this shift go with it (on delete cascade): those days fall back to the regular schedule.
  const { error } = await db.from("shifts").delete().eq("id", id);
  if (error) {
    console.error("deleteShift: delete failed", error);
    return { ok: false, error: "Gagal menghapus shift." };
  }
  revalidatePath("/pengaturan/shift");
  return { ok: true };
}

/** value: a shift id, "libur", or "" (back to the regular schedule). */
export async function setRosterDay(employeeId: string, tanggal: string, value: string): Promise<Result> {
  const { db, me } = await hrOnly();
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  if (!UUID_RE.test(employeeId) || !DATE_RE.test(tanggal)) return { ok: false, error: "Data tidak valid." };
  if (value === "") {
    const { error } = await db.from("shift_assignments").delete().eq("employee_id", employeeId).eq("tanggal", tanggal);
    if (error) return { ok: false, error: "Gagal menyimpan roster." };
  } else {
    if (value !== "libur" && !UUID_RE.test(value)) return { ok: false, error: "Shift tidak valid." };
    const { error } = await db
      .from("shift_assignments")
      .upsert(
        { employee_id: employeeId, tanggal, shift_id: value === "libur" ? null : value, created_by: me.id },
        { onConflict: "employee_id,tanggal" },
      );
    if (error) {
      console.error("setRosterDay: upsert failed", error);
      return { ok: false, error: "Gagal menyimpan roster." };
    }
  }
  revalidatePath("/pengaturan/shift");
  return { ok: true };
}

/** Copies last week's roster of these employees onto the week starting `monday`. */
export async function copyPreviousWeek(employeeIds: string[], monday: string): Promise<Result> {
  const { db, me } = await hrOnly();
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  if (!DATE_RE.test(monday) || employeeIds.some((id) => !UUID_RE.test(id))) return { ok: false, error: "Data tidak valid." };
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("shift_assignments")
    .select("employee_id, tanggal, shift_id")
    .in("employee_id", employeeIds)
    .gte("tanggal", shift(monday, -7))
    .lte("tanggal", shift(monday, -1));
  if (error) return { ok: false, error: "Gagal membaca roster minggu lalu." };
  if (!data?.length) return { ok: false, error: "Minggu lalu belum ada roster untuk disalin." };
  const rows = data.map((r) => ({
    employee_id: r.employee_id,
    tanggal: shift(r.tanggal as string, 7),
    shift_id: r.shift_id,
    created_by: me.id,
  }));
  const { error: upErr } = await db.from("shift_assignments").upsert(rows, { onConflict: "employee_id,tanggal" });
  if (upErr) {
    console.error("copyPreviousWeek: upsert failed", upErr);
    return { ok: false, error: "Gagal menyalin roster." };
  }
  revalidatePath("/pengaturan/shift");
  return { ok: true, message: `${rows.length} jadwal disalin dari minggu lalu.` };
}
