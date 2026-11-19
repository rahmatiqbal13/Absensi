"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { EMPLOYEE_CORRECTION_MAX_DAYS_BACK, validateCorrectionInput } from "@/lib/attendance/correction";
import { cancelCorrection, submitCorrection } from "@/lib/attendance/correction-service";
import { notifyApproverOfCorrection } from "@/lib/attendance/correction-notify";

type Result = { ok: true } | { ok: false; error: string };

export async function submitAttendanceCorrection(formData: FormData): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return { ok: false, error: "Anda belum masuk. Silakan login ulang." };

  const now = new Date();
  const parsed = validateCorrectionInput(
    {
      tanggal: String(formData.get("tanggal") ?? ""),
      jamMasuk: String(formData.get("jamMasuk") ?? ""),
      jamPulang: String(formData.get("jamPulang") ?? ""),
      alasan: String(formData.get("alasan") ?? ""),
    },
    { now, today: toJakartaDateOnly(now), maxDaysBack: EMPLOYEE_CORRECTION_MAX_DAYS_BACK },
  );
  if (!parsed.ok) return parsed;

  const service = createServiceRoleSupabaseClient();
  const result = await submitCorrection(service, me.id, parsed.value);
  if (!result.ok) return result;

  // Best effort: a mail failure must never undo a saved request.
  await notifyApproverOfCorrection(service, result.correctionId).catch((e) =>
    console.error("submitAttendanceCorrection: approver notification failed", e),
  );
  revalidatePath("/riwayat");
  return { ok: true };
}

export async function cancelAttendanceCorrection(correctionId: string): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return { ok: false, error: "Anda belum masuk. Silakan login ulang." };
  const result = await cancelCorrection(createServiceRoleSupabaseClient(), me.id, correctionId);
  if (result.ok) revalidatePath("/riwayat");
  return result;
}
