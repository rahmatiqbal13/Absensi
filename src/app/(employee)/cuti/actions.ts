"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { submitLeaveRequest, type SubmitLeaveResult } from "@/lib/leave/submit";

export async function submitLeave(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    return { ok: false, error: "Anda belum masuk. Silakan login ulang." };
  }

  const jenis = formData.get("jenis") as string;
  const tanggalMulai = formData.get("tanggalMulai") as string;
  const tanggalSelesai = formData.get("tanggalSelesai") as string;
  const alasan = (formData.get("alasan") as string | null)?.trim() || undefined;

  if (!jenis || !tanggalMulai || !tanggalSelesai) {
    return { ok: false, error: "Jenis cuti dan tanggal wajib diisi." };
  }
  if (tanggalSelesai < tanggalMulai) {
    return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  }

  const result: SubmitLeaveResult = await submitLeaveRequest(db, {
    employeeId: employee.id,
    jenis,
    tanggalMulai,
    tanggalSelesai,
    alasan,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
