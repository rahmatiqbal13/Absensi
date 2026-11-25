"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateScheduleInput } from "@/lib/schedule/validate-schedule";
import { templateTargetsError } from "@/lib/schedule/templates";

type Result = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEED_MIGRATION = "Fitur ini butuh migrasi 0067_schedule_templates.sql.";

async function authorizedDb() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return null;
  return db;
}

function revalidate() {
  revalidatePath("/pengaturan/jadwal");
  revalidatePath("/pengaturan/cabang");
  revalidatePath("/laporan");
}

/**
 * Creates (`templateId` null) or edits a jadwal (schedule_templates, 0067).
 * Editing rewrites every branch / department / employee using it (DB trigger).
 */
export async function saveTemplate(templateId: string | null, formData: FormData): Promise<Result> {
  const db = await authorizedDb();
  if (!db) return { ok: false, error: "Tidak diizinkan." };
  if (templateId && !UUID_RE.test(templateId)) return { ok: false, error: "Jadwal tidak valid." };

  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) return { ok: false, error: "Beri nama jadwal, mis. \"Kantor Sen–Jum\"." };
  if (nama.length > 60) return { ok: false, error: "Nama jadwal maksimal 60 karakter." };

  const parsed = validateScheduleInput({
    jamMasuk: formData.get("jamMasuk"),
    jamPulang: formData.get("jamPulang"),
    hariKerja: formData.getAll("hariKerja"),
    toleransiMenit: formData.get("toleransiMenit"),
  });
  if (!parsed.ok) return parsed;

  const values = {
    nama,
    jam_masuk: parsed.value.jamMasuk,
    jam_pulang: parsed.value.jamPulang,
    hari_kerja: parsed.value.hariKerja,
    toleransi_terlambat_menit: parsed.value.toleransiMenit,
    potong_terlambat: formData.get("potongTerlambat") === "on",
    hitung_lembur: formData.get("hitungLembur") === "on",
  };
  const { error } = templateId
    ? await db.from("schedule_templates").update(values).eq("id", templateId)
    : await db.from("schedule_templates").insert(values);
  if (error) {
    if (error.code === "23505") return { ok: false, error: `Nama "${nama}" sudah dipakai jadwal lain.` };
    if (error.code === "42P01") return { ok: false, error: NEED_MIGRATION };
    console.error("saveTemplate: write failed", error);
    return { ok: false, error: "Gagal menyimpan jadwal." };
  }
  revalidate();
  return { ok: true };
}

/**
 * Sets exactly where a jadwal applies. Branches can only be moved onto it, never
 * left without a jadwal utama — the database refuses that (0067).
 */
export async function setTemplateTargets(
  templateId: string,
  targets: { branchIds: string[]; departmentIds: string[]; employeeIds: string[] },
): Promise<Result> {
  const db = await authorizedDb();
  if (!db) return { ok: false, error: "Tidak diizinkan." };
  if (!UUID_RE.test(templateId)) return { ok: false, error: "Jadwal tidak valid." };
  const ids = (list: string[]) => [...new Set(list)].filter((id) => UUID_RE.test(id));

  const { error } = await db.rpc("set_schedule_template_targets", {
    p_template: templateId,
    p_branches: ids(targets.branchIds),
    p_departments: ids(targets.departmentIds),
    p_employees: ids(targets.employeeIds),
  });
  if (error) {
    const friendly = templateTargetsError(error.message);
    if (friendly) return { ok: false, error: friendly };
    if (error.code === "PGRST202" || error.code === "42883") return { ok: false, error: NEED_MIGRATION };
    console.error("setTemplateTargets: rpc failed", error);
    return { ok: false, error: "Gagal menyimpan penerapan jadwal." };
  }
  revalidate();
  return { ok: true };
}

/**
 * Deletes a jadwal. Its departments and employees fall back to their branch's
 * jadwal utama; a jadwal that is still some branch's jadwal utama can't go.
 */
export async function deleteTemplate(templateId: string): Promise<Result> {
  const db = await authorizedDb();
  if (!db) return { ok: false, error: "Tidak diizinkan." };
  if (!UUID_RE.test(templateId)) return { ok: false, error: "Jadwal tidak valid." };

  const { data: utama, error: lookupErr } = await db
    .from("work_schedules")
    .select("branches(nama)")
    .eq("template_id", templateId)
    .is("department_id", null)
    .is("nama", null);
  if (lookupErr) {
    console.error("deleteTemplate: lookup failed", lookupErr);
    return { ok: false, error: "Gagal menghapus jadwal." };
  }
  if (utama?.length) {
    const names = (utama as { branches: { nama: string } | { nama: string }[] | null }[])
      .map((r) => (Array.isArray(r.branches) ? r.branches[0]?.nama : r.branches?.nama))
      .filter(Boolean)
      .join(", ");
    return { ok: false, error: `Jadwal ini masih jadwal utama cabang ${names}. Pindahkan cabangnya ke jadwal lain dulu.` };
  }

  const { data, error } = await db.from("schedule_templates").delete().eq("id", templateId).select("id");
  if (error || !data?.length) {
    if (error) console.error("deleteTemplate: delete failed", error);
    return { ok: false, error: "Gagal menghapus jadwal." };
  }
  revalidate();
  return { ok: true };
}
