"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { validateCorrectionInput } from "@/lib/attendance/correction";
import { decideCorrection, hrCorrectAttendance } from "@/lib/attendance/correction-service";

type Result = { ok: true } | { ok: false; error: string };

async function decide(correctionId: string, approve: boolean, catatan: string | null): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role === "karyawan") return { ok: false, error: "Tidak diizinkan." };
  const r = await decideCorrection(createServiceRoleSupabaseClient(), me, correctionId, approve, catatan);
  if (r.ok) {
    revalidatePath("/persetujuan-koreksi");
    revalidatePath("/", "layout"); // sidebar pending count
  }
  return r;
}

export async function approveCorrection(correctionId: string, catatan: string | null): Promise<Result> {
  return decide(correctionId, true, catatan);
}

export async function rejectCorrection(correctionId: string, catatan: string): Promise<Result> {
  if (!catatan?.trim()) return { ok: false, error: "Catatan wajib diisi untuk menolak." };
  return decide(correctionId, false, catatan);
}

/** HR fixes a day directly from the per-employee report (no approval step). */
export async function hrCorrectAttendanceAction(employeeId: string, formData: FormData): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return { ok: false, error: "Tidak diizinkan." };

  const now = new Date();
  const parsed = validateCorrectionInput(
    {
      tanggal: String(formData.get("tanggal") ?? ""),
      jamMasuk: String(formData.get("jamMasuk") ?? ""),
      jamPulang: String(formData.get("jamPulang") ?? ""),
      alasan: String(formData.get("alasan") ?? ""),
    },
    { now, today: toJakartaDateOnly(now) }, // no look-back limit for HR; payroll lock still applies
  );
  if (!parsed.ok) return parsed;

  const r = await hrCorrectAttendance(createServiceRoleSupabaseClient(), me, employeeId, parsed.value);
  if (r.ok) revalidatePath(`/laporan/karyawan/${employeeId}`);
  return r;
}
