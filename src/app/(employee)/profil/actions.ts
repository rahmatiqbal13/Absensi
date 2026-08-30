"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth/session";
import { profilePhotoPath, PROFILE_PHOTO_BUCKET } from "@/lib/profile/photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const PHONE_RE = /^[0-9+\-\s]{8,20}$/;
const MAX_PHOTO_BYTES = 200 * 1024;

async function gate() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return { db, me: null, denied: { ok: false as const, error: "Tidak diizinkan." } };
  return { db, me, denied: null };
}

export async function updatePhone(formData: FormData): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const raw = String(formData.get("no_telp") ?? "").trim();
  const no_telp = raw === "" ? null : raw;
  if (no_telp !== null && !PHONE_RE.test(no_telp)) {
    return { ok: false, error: "Nomor telepon tidak valid (8–20 digit)." };
  }

  const { data, error } = await db
    .from("employees")
    .update({ no_telp })
    .eq("id", me!.id)
    .select("id");
  if (error) {
    console.error("updatePhone: update failed", error);
    return { ok: false, error: "Gagal menyimpan nomor telepon." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Gagal menyimpan — coba muat ulang." };
  }
  revalidatePath("/profil");
  return { ok: true };
}

export async function uploadPhoto(formData: FormData): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const photo = formData.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) {
    return { ok: false, error: "Pilih foto." };
  }
  if (photo.type !== "image/jpeg") {
    return { ok: false, error: "Foto tidak valid." };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "Foto terlalu besar." };
  }

  const path = profilePhotoPath(me!.id);
  const { error: upErr } = await db.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, photo, { contentType: "image/jpeg", upsert: true });
  if (upErr) {
    console.error("uploadPhoto: upload failed", upErr);
    return { ok: false, error: "Gagal mengunggah foto." };
  }

  const { data, error } = await db
    .from("employees")
    .update({ foto_profil_url: path })
    .eq("id", me!.id)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("uploadPhoto: settings update failed", error);
    return { ok: false, error: "Gagal menyimpan foto." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removePhoto(): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const { error: rmErr } = await db.storage
    .from(PROFILE_PHOTO_BUCKET)
    .remove([profilePhotoPath(me!.id)]);
  if (rmErr) console.error("removePhoto: storage remove failed", rmErr);

  const { data, error } = await db
    .from("employees")
    .update({ foto_profil_url: null })
    .eq("id", me!.id)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("removePhoto: update failed", error);
    return { ok: false, error: "Gagal menghapus foto." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
