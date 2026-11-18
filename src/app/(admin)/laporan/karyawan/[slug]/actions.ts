"use server";

import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadAttendanceEvidence, type EvidenceResult } from "@/lib/attendance/evidence";

/** Selfies + positions of one attendance day, for HR (see lib/attendance/evidence.ts). */
export async function getAttendanceEvidence(employeeId: string, tanggal: string): Promise<EvidenceResult> {
  const db = await createServerSupabaseClient();
  const viewer = await getCurrentEmployee(db);
  if (!viewer) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  return loadAttendanceEvidence(db, createServiceRoleSupabaseClient(), viewer, employeeId, tanggal);
}
