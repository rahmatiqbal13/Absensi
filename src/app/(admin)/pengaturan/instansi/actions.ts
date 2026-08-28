"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth/session";
import { normalizeHex } from "@/lib/branding/accent";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_BYTES = 512 * 1024;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

async function gate() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role !== "super_admin") {
    return { db, me: null, denied: { ok: false as const, error: "Tidak diizinkan." } };
  }
  return { db, me, denied: null };
}

export async function saveAppSettings(formData: FormData): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const namaInstansi = String(formData.get("nama_instansi") ?? "").trim();
  const namaSingkat = String(formData.get("nama_singkat") ?? "").trim();
  const warnaAksen = String(formData.get("warna_aksen") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim() || null;
  const alamat = String(formData.get("alamat") ?? "").trim() || null;
  const telepon = String(formData.get("telepon") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;

  if (!namaInstansi) return { ok: false, error: "Nama instansi wajib diisi." };
  if (!namaSingkat) return { ok: false, error: "Nama singkat wajib diisi." };
  if (!HEX_RE.test(warnaAksen)) return { ok: false, error: "Format warna aksen harus #RRGGBB." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Format email tidak valid." };
  }

  const { error } = await db
    .from("app_settings")
    .update({
      nama_instansi: namaInstansi,
      nama_singkat: namaSingkat,
      tagline,
      alamat,
      telepon,
      email,
      warna_aksen: normalizeHex(warnaAksen),
      updated_at: new Date().toISOString(),
      updated_by: me!.id,
    })
    .eq("id", 1);
  if (error) {
    console.error("saveAppSettings: update failed", error);
    return { ok: false, error: "Gagal menyimpan pengaturan instansi." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function uploadLogo(formData: FormData): Promise<Result> {
  const { db, denied } = await gate();
  if (denied) return denied;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pilih berkas logo." };
  }
  if (!ACCEPTED.includes(file.type)) {
    return { ok: false, error: "Logo harus PNG, JPG, WEBP, atau SVG." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Ukuran logo maksimal 512 KB." };
  }

  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1];
  const path = `logo-${Date.now()}.${ext}`;

  const { error: upErr } = await db.storage.from("branding").upload(path, file, { upsert: true });
  if (upErr) {
    console.error("uploadLogo: upload failed", upErr);
    return { ok: false, error: "Gagal mengunggah logo." };
  }

  const { data: current } = await db.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();
  const oldPath = current?.logo_url;

  const { error: updErr } = await db.from("app_settings").update({ logo_url: path }).eq("id", 1);
  if (updErr) {
    console.error("uploadLogo: settings update failed", updErr);
    return { ok: false, error: "Gagal menyimpan logo." };
  }
  if (oldPath && oldPath !== path) {
    const { error: rmErr } = await db.storage.from("branding").remove([oldPath]);
    if (rmErr) console.error("uploadLogo: old logo cleanup failed", rmErr);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeLogo(): Promise<Result> {
  const { db, denied } = await gate();
  if (denied) return denied;

  const { data: current } = await db.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();
  const oldPath = current?.logo_url;

  const { error } = await db.from("app_settings").update({ logo_url: null }).eq("id", 1);
  if (error) {
    console.error("removeLogo: update failed", error);
    return { ok: false, error: "Gagal menghapus logo." };
  }
  if (oldPath) {
    const { error: rmErr } = await db.storage.from("branding").remove([oldPath]);
    if (rmErr) console.error("removeLogo: file cleanup failed", rmErr);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
