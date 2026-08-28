"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateScheduleInput } from "@/lib/schedule/validate-schedule";

type Result = { ok: true } | { ok: false; error: string };

export async function saveSchedule(branchId: string, formData: FormData): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const parsed = validateScheduleInput({
    jamMasuk: formData.get("jamMasuk"),
    jamPulang: formData.get("jamPulang"),
    hariKerja: formData.getAll("hariKerja"),
    toleransiMenit: formData.get("toleransiMenit"),
  });
  if (!parsed.ok) return parsed;

  const { error } = await db.from("work_schedules").upsert(
    {
      branch_id: branchId,
      jam_masuk: parsed.value.jamMasuk,
      jam_pulang: parsed.value.jamPulang,
      hari_kerja: parsed.value.hariKerja,
      toleransi_terlambat_menit: parsed.value.toleransiMenit,
    },
    { onConflict: "branch_id" },
  );
  if (error) {
    console.error("saveSchedule: upsert failed", error);
    return { ok: false, error: "Gagal menyimpan jadwal kerja." };
  }
  revalidatePath("/pengaturan/jadwal");
  return { ok: true };
}
