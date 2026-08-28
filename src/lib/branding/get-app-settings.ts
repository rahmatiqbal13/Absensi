import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AppSettings = {
  namaInstansi: string;
  namaSingkat: string;
  tagline: string | null;
  logoUrl: string | null;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  warnaAksen: string;
};

export const APP_SETTINGS_DEFAULTS: AppSettings = {
  namaInstansi: "Absensi HR",
  namaSingkat: "Absensi HR",
  tagline: null,
  logoUrl: null,
  alamat: null,
  telepon: null,
  email: null,
  warnaAksen: "#2563EB",
};

export async function getAppSettingsUncached(): Promise<AppSettings> {
  try {
    const db = await createServerSupabaseClient();
    const { data, error } = await db
      .from("app_settings")
      .select("nama_instansi, nama_singkat, tagline, logo_url, alamat, telepon, email, warna_aksen")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("getAppSettings: query failed", error);
      return APP_SETTINGS_DEFAULTS;
    }
    const logoUrl = data.logo_url
      ? db.storage.from("branding").getPublicUrl(data.logo_url).data.publicUrl
      : null;
    return {
      namaInstansi: data.nama_instansi,
      namaSingkat: data.nama_singkat,
      tagline: data.tagline,
      logoUrl,
      alamat: data.alamat,
      telepon: data.telepon,
      email: data.email,
      warnaAksen: (data.warna_aksen as string).toUpperCase(),
    };
  } catch (err) {
    console.error("getAppSettings: unexpected", err);
    return APP_SETTINGS_DEFAULTS;
  }
}

export const getAppSettings = cache(getAppSettingsUncached);
