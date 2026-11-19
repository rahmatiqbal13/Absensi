"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateReminderSetting } from "@/lib/attendance/reminder-settings";

type Result = { ok: true } | { ok: false; error: string };

/** Saves one reminder's on/off, time and wording (HR / super admin; RLS 0060). */
export async function saveReminderSetting(formData: FormData): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Hanya HR yang dapat mengubah pengingat." };
  }
  const parsed = validateReminderSetting(Object.fromEntries(formData));
  if (!parsed.ok) return parsed;

  const { error } = await db
    .from("reminder_settings")
    .upsert({ ...parsed.value, updated_at: new Date().toISOString(), updated_by: me.id }, { onConflict: "jenis" });
  if (error) {
    console.error("saveReminderSetting: upsert failed", error);
    return { ok: false, error: "Gagal menyimpan pengingat. Pastikan migrasi 0060 sudah dijalankan." };
  }
  revalidatePath("/pengumuman/reminder");
  return { ok: true };
}
