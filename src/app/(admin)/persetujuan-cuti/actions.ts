"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

type ActionResult = { ok: true } | { ok: false; error: string };

const RPC_ERROR_MESSAGES: Record<string, string> = {
  "self-approval is not allowed": "Anda tidak dapat menyetujui pengajuan cuti Anda sendiri.",
  "only the assigned approver may act on this request":
    "Hanya atasan yang ditunjuk yang dapat memproses pengajuan ini.",
  "leave request is not pending": "Pengajuan ini sudah diproses sebelumnya.",
  "leave request not found": "Pengajuan cuti tidak ditemukan.",
  "catatan_approval is required to reject a leave request": "Catatan wajib diisi untuk menolak pengajuan.",
  "insufficient leave balance to approve this request":
    "Saldo cuti karyawan tidak mencukupi untuk menyetujui pengajuan ini.",
};

function mapRpcError(message: string | undefined): string {
  if (!message) return "Gagal memproses pengajuan cuti.";
  for (const [key, friendly] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (message.includes(key)) return friendly;
  }
  console.error("persetujuan-cuti: unmapped RPC error", message);
  return "Gagal memproses pengajuan cuti.";
}

export async function approveLeave(requestId: string, catatan: string | null): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  const { error } = await db.rpc("approve_leave_request", {
    p_request_id: requestId,
    p_catatan: catatan,
  });
  if (error) {
    return { ok: false, error: mapRpcError(error.message) };
  }
  revalidatePath("/persetujuan-cuti");
  return { ok: true };
}

export async function rejectLeave(requestId: string, catatan: string): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  const { error } = await db.rpc("reject_leave_request", {
    p_request_id: requestId,
    p_catatan: catatan,
  });
  if (error) {
    return { ok: false, error: mapRpcError(error.message) };
  }
  revalidatePath("/persetujuan-cuti");
  return { ok: true };
}
