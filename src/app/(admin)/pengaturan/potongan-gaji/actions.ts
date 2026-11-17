"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function gate() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role !== "super_admin") return null;
  return db;
}

/** Company-wide default: is alpa deducted for employees without their own choice? */
export async function saveCompanyPotongAlpa(enabled: boolean): Promise<Result> {
  const db = await gate();
  if (!db) return { ok: false, error: "Hanya Super Admin yang dapat mengubah pengaturan ini." };

  const { data, error } = await db
    .from("app_settings")
    .update({ potong_alpa: enabled === true, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("id");
  if (error || !data?.length) {
    console.error("saveCompanyPotongAlpa: update failed", error);
    return { ok: false, error: "Gagal menyimpan pengaturan potongan alpa." };
  }
  revalidatePath("/pengaturan/potongan-gaji");
  return { ok: true };
}

/**
 * Sets the alpa-deduction choice for one or more employees:
 * null = follow the company setting, true = always deduct, false = never deduct.
 */
export async function setEmployeesPotongAlpa(ids: string[], value: boolean | null): Promise<Result> {
  const db = await gate();
  if (!db) return { ok: false, error: "Hanya Super Admin yang dapat mengubah pengaturan ini." };

  const unique = [...new Set(Array.isArray(ids) ? ids : [])];
  if (unique.length === 0) return { ok: false, error: "Pilih minimal satu karyawan." };
  if (unique.length > 1000 || !unique.every((id) => typeof id === "string" && UUID_RE.test(id))) {
    return { ok: false, error: "Daftar karyawan tidak valid." };
  }
  if (value !== null && typeof value !== "boolean") return { ok: false, error: "Pilihan tidak valid." };

  const { data, error } = await db
    .from("employees")
    .update({ potong_alpa: value })
    .in("id", unique)
    .select("id");
  if (error) {
    console.error("setEmployeesPotongAlpa: update failed", error);
    return { ok: false, error: "Gagal menyimpan pengaturan karyawan." };
  }
  revalidatePath("/pengaturan/potongan-gaji");
  return { ok: true, message: `${data?.length ?? 0} karyawan diperbarui.` };
}

/** Flat PPh 21 rate (percent) withheld from every payslip generated from now on. */
export async function saveTarifPph21(tarifPersen: number): Promise<Result> {
  const db = await gate();
  if (!db) return { ok: false, error: "Hanya Super Admin yang dapat mengubah pengaturan ini." };

  const tarif = Number(tarifPersen);
  if (!Number.isFinite(tarif) || tarif < 0 || tarif > 100 || Math.round(tarif * 100) !== tarif * 100) {
    return { ok: false, error: "Tarif PPh 21 harus 0–100 dengan maksimal 2 angka desimal." };
  }

  const { data, error } = await db
    .from("app_settings")
    .update({ tarif_pph21_persen: tarif, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("id");
  if (error || !data?.length) {
    console.error("saveTarifPph21: update failed", error);
    return { ok: false, error: "Gagal menyimpan tarif PPh 21." };
  }
  revalidatePath("/pengaturan/potongan-gaji");
  return { ok: true, message: "Tarif PPh 21 tersimpan." };
}
