"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateTerBrackets } from "@/lib/payroll/pph21";
import { PTKP_STATUSES } from "@/lib/employees/employee-form";

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

/** PPh 21 method: monthly TER (PP 58/2023) or a flat company rate. */
export async function saveMetodePph21(metode: "ter" | "tarif_tetap"): Promise<Result> {
  const db = await gate();
  if (!db) return { ok: false, error: "Hanya Super Admin yang dapat mengubah pengaturan ini." };
  if (metode !== "ter" && metode !== "tarif_tetap") return { ok: false, error: "Metode tidak valid." };
  const { data, error } = await db
    .from("app_settings")
    .update({ metode_pph21: metode, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("id");
  if (error || !data?.length) {
    console.error("saveMetodePph21: update failed", error);
    return { ok: false, error: "Gagal menyimpan metode PPh 21. Pastikan migrasi database terbaru sudah dijalankan." };
  }
  revalidatePath("/pengaturan/potongan-gaji");
  return { ok: true, message: metode === "ter" ? "Metode TER aktif." : "Metode tarif tetap aktif." };
}

/** Replaces one TER category's brackets (rows: lower bound in rupiah + rate %). */
export async function saveTerTable(
  kategori: "A" | "B" | "C",
  rows: { batasBawah: number; tarifPersen: number }[],
): Promise<Result> {
  const db = await gate();
  if (!db) return { ok: false, error: "Hanya Super Admin yang dapat mengubah pengaturan ini." };
  if (!["A", "B", "C"].includes(kategori)) return { ok: false, error: "Kategori tidak valid." };
  if (!Array.isArray(rows) || rows.length > 200) return { ok: false, error: "Data tabel tidak valid." };
  const parsed = validateTerBrackets(rows.map((r) => ({ batasBawah: Number(r.batasBawah), tarifPersen: Number(r.tarifPersen) })));
  if (!parsed.ok) return parsed;

  // Upsert the new rows first, then drop the ones no longer present, so a
  // failure part-way never leaves the category empty.
  const { error: upErr } = await db.from("pph21_ter_rates").upsert(
    parsed.rows.map((r) => ({ kategori, batas_bawah: r.batasBawah, tarif_persen: r.tarifPersen })),
    { onConflict: "kategori,batas_bawah" },
  );
  if (upErr) {
    console.error("saveTerTable: upsert failed", upErr);
    return { ok: false, error: "Gagal menyimpan tabel TER." };
  }
  const keep = parsed.rows.map((r) => r.batasBawah);
  const { error: delErr } = await db
    .from("pph21_ter_rates")
    .delete()
    .eq("kategori", kategori)
    .not("batas_bawah", "in", `(${keep.join(",")})`);
  if (delErr) {
    console.error("saveTerTable: cleanup failed", delErr);
    return { ok: false, error: "Tabel tersimpan sebagian. Muat ulang dan periksa kembali." };
  }
  revalidatePath("/pengaturan/potongan-gaji");
  return { ok: true, message: `Tabel TER kategori ${kategori} tersimpan.` };
}

/** PTKP status → TER category mapping. */
export async function savePtkpKategori(map: Record<string, "A" | "B" | "C">): Promise<Result> {
  const db = await gate();
  if (!db) return { ok: false, error: "Hanya Super Admin yang dapat mengubah pengaturan ini." };
  const rows = Object.entries(map ?? {});
  if (
    rows.length !== PTKP_STATUSES.length ||
    !rows.every(([st, k]) => (PTKP_STATUSES as readonly string[]).includes(st) && ["A", "B", "C"].includes(k))
  ) {
    return { ok: false, error: "Pemetaan PTKP tidak valid." };
  }
  const { error } = await db
    .from("pph21_ptkp_kategori")
    .upsert(rows.map(([status_ptkp, kategori]) => ({ status_ptkp, kategori })), { onConflict: "status_ptkp" });
  if (error) {
    console.error("savePtkpKategori: upsert failed", error);
    return { ok: false, error: "Gagal menyimpan pemetaan PTKP." };
  }
  revalidatePath("/pengaturan/potongan-gaji");
  return { ok: true, message: "Pemetaan PTKP tersimpan." };
}
