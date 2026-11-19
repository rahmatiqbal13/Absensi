import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * HR-editable attendance reminders (migration 0060, menu Pengumuman >
 * Reminder). `menit` is relative to the employee's own schedule:
 * masuk = before jam masuk, terlambat = after jam masuk + toleransi,
 * pulang = after jam pulang.
 */
export type ReminderJenis = "masuk" | "terlambat" | "pulang";
export const REMINDER_JENIS: readonly ReminderJenis[] = ["masuk", "terlambat", "pulang"];

export type ReminderSetting = { jenis: ReminderJenis; aktif: boolean; menit: number; judul: string; isi: string };
export type ReminderSettings = Record<ReminderJenis, ReminderSetting>;

export const REMINDER_MAX_MENIT = 240;
export const REMINDER_JUDUL_MAX = 100;
export const REMINDER_ISI_MAX = 300;

/** Same as the rows 0060 seeds; used until the migration runs. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  masuk: {
    jenis: "masuk",
    aktif: true,
    menit: 15,
    judul: "Sebentar lagi jam masuk",
    isi: "Jadwal masuk Anda pukul {jam} WIB. Jangan lupa absen masuk.",
  },
  terlambat: {
    jenis: "terlambat",
    aktif: true,
    menit: 0,
    judul: "Anda belum absen masuk hari ini",
    isi: "Jadwal masuk Anda pukul {jam} WIB. Kalau hari ini izin atau sakit, ajukan cuti.",
  },
  pulang: {
    jenis: "pulang",
    aktif: true,
    menit: 0,
    judul: "Sudah jam pulang",
    isi: "Jadwal pulang Anda pukul {jam} WIB. Jangan lupa absen pulang.",
  },
};

export const REMINDER_LABEL: Record<ReminderJenis, { title: string; menitLabel: string; description: string }> = {
  masuk: {
    title: "Pengingat absen masuk",
    menitLabel: "Menit sebelum jam masuk",
    description: "Dikirim sebelum jam masuk ke karyawan yang belum absen masuk.",
  },
  terlambat: {
    title: "Pengingat lupa absen",
    menitLabel: "Menit setelah batas terlambat",
    description: "Dikirim setelah jam masuk + toleransi lewat dan karyawan masih belum absen.",
  },
  pulang: {
    title: "Pengingat absen pulang",
    menitLabel: "Menit setelah jam pulang",
    description: "Dikirim setelah jam pulang ke karyawan yang sudah absen masuk tapi belum absen pulang.",
  },
};

/** Fills {nama} and {jam}. Unknown placeholders are left as typed. */
export function renderReminder(template: string, vars: { nama: string; jam: string }): string {
  return template.replace(/\{(nama|jam)\}/g, (_, k: "nama" | "jam") => vars[k]);
}

export function validateReminderSetting(
  input: Record<string, unknown>,
): { ok: true; value: ReminderSetting } | { ok: false; error: string } {
  const jenis = String(input.jenis ?? "") as ReminderJenis;
  if (!REMINDER_JENIS.includes(jenis)) return { ok: false, error: "Jenis pengingat tidak valid." };
  const aktif = input.aktif === "on" || input.aktif === "true" || input.aktif === true;
  const menitRaw = String(input.menit ?? "").trim();
  const menit = Number(menitRaw);
  if (menitRaw === "" || !Number.isInteger(menit) || menit < 0 || menit > REMINDER_MAX_MENIT) {
    return { ok: false, error: `Waktu harus bilangan bulat 0–${REMINDER_MAX_MENIT} menit.` };
  }
  const judul = String(input.judul ?? "").trim();
  const isi = String(input.isi ?? "").trim();
  if (!judul) return { ok: false, error: "Judul wajib diisi." };
  if (judul.length > REMINDER_JUDUL_MAX) return { ok: false, error: `Judul maksimal ${REMINDER_JUDUL_MAX} karakter.` };
  if (!isi) return { ok: false, error: "Isi pesan wajib diisi." };
  if (isi.length > REMINDER_ISI_MAX) return { ok: false, error: `Isi pesan maksimal ${REMINDER_ISI_MAX} karakter.` };
  return { ok: true, value: { jenis, aktif, menit, judul, isi } };
}

// Table missing: Postgres 42P01, or PostgREST's "not in the schema cache".
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /relation .* does not exist/i.test(error.message ?? "");
}

/**
 * The saved settings over the defaults. Missing table (pre-0060) or a failed
 * read = defaults, so reminders keep working.
 */
export async function loadReminderSettings(
  db: SupabaseClient,
): Promise<{ settings: ReminderSettings; migrated: boolean }> {
  const settings: ReminderSettings = { ...DEFAULT_REMINDER_SETTINGS };
  const { data, error } = await db.from("reminder_settings").select("jenis, aktif, menit, judul, isi");
  if (error) {
    if (isMissingTable(error)) {
      console.warn("loadReminderSettings: tabel belum ada — jalankan migrasi 0060. Memakai pengaturan bawaan.");
    } else {
      console.error("loadReminderSettings: lookup failed", error);
    }
    return { settings, migrated: !isMissingTable(error) };
  }
  for (const r of (data ?? []) as ReminderSetting[]) {
    if (REMINDER_JENIS.includes(r.jenis)) settings[r.jenis] = { ...r, menit: Number(r.menit) };
  }
  return { settings, migrated: true };
}
