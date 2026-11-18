"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth/session";
import { profilePhotoPath, PROFILE_PHOTO_BUCKET } from "@/lib/profile/photo";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { validatePasswordChange } from "@/lib/auth/change-password";
import { withinRateLimit } from "@/lib/security/rate-limit";
import { withdrawConsent } from "@/lib/consent/consent";

type Result = { ok: true } | { ok: false; error: string };

const PHONE_RE = /^[0-9+\-\s]{8,20}$/;
const MAX_PHOTO_BYTES = 512 * 1024;

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
    .upload(path, photo, { contentType: "image/jpeg", upsert: true, cacheControl: "60" });
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

  const { data, error } = await db
    .from("employees")
    .update({ foto_profil_url: null })
    .eq("id", me!.id)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("removePhoto: update failed", error);
    return { ok: false, error: "Gagal menghapus foto." };
  }

  const { error: rmErr } = await db.storage
    .from(PROFILE_PHOTO_BUCKET)
    .remove([profilePhotoPath(me!.id)]);
  if (rmErr) console.error("removePhoto: storage remove failed", rmErr);

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Changes the signed-in user's password after re-checking the current one.
 * The check uses a throwaway client so the live session cookies are untouched,
 * and is rate-limited so an unattended open session can't be used to guess
 * the old password.
 */
export async function changePassword(formData: FormData): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const valid = validatePasswordChange({ current, next, confirm });
  if (!valid.ok) return valid;

  const allowed = await withinRateLimit(createServiceRoleSupabaseClient(), [
    { key: `pwchange:emp:${me!.id}`, max: 5, windowSeconds: 15 * 60 },
  ]);
  if (!allowed) return { ok: false, error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." };

  const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authErr } = await verifier.auth.signInWithPassword({ email: me!.email, password: current });
  if (authErr) return { ok: false, error: "Kata sandi saat ini salah." };
  // "local" ends only this throwaway session; the default ("global") would
  // also sign the user out of the session they are using right now.
  await verifier.auth.signOut({ scope: "local" }).catch(() => {});

  const { error } = await db.auth.updateUser({ password: next });
  if (error) {
    console.error("changePassword: update failed", error);
    if (/weak|short/i.test(error.message)) return { ok: false, error: "Kata sandi baru terlalu lemah. Gunakan kombinasi yang lebih panjang." };
    return { ok: false, error: "Gagal mengganti kata sandi. Coba lagi." };
  }
  return { ok: true };
}

/** UU PDP: withdraw consent to location/photo processing (re-asked at the next clock-in). */
export async function withdrawMyConsent(): Promise<Result> {
  const { db, denied } = await gate();
  if (denied) return denied;
  const r = await withdrawConsent(db);
  if (r.ok) revalidatePath("/profil");
  return r;
}
