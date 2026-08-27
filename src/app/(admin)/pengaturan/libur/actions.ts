"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

type Result = { ok: true } | { ok: false; error: string };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addHoliday(formData: FormData): Promise<Result> {
  const tanggal = String(formData.get("tanggal") ?? "").trim();
  const nama = String(formData.get("nama") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "").trim() || null;
  if (!ISO_DATE.test(tanggal) || !nama) {
    return { ok: false, error: "Tanggal (YYYY-MM-DD) dan nama libur wajib diisi." };
  }
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  const { error } = await db.from("holidays").insert({ tanggal, nama, branch_id: branchId });
  if (error) {
    console.error("addHoliday: insert failed", error);
    return { ok: false, error: "Gagal menambah libur." };
  }
  revalidatePath("/pengaturan/libur");
  return { ok: true };
}

export async function deleteHoliday(id: string): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  const { data, error } = await db.from("holidays").delete().eq("id", id).select("id");
  if (error) {
    console.error("deleteHoliday: delete failed", error);
    return { ok: false, error: "Gagal menghapus libur." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Gagal menghapus libur atau Anda tidak berhak." };
  }
  revalidatePath("/pengaturan/libur");
  return { ok: true };
}
