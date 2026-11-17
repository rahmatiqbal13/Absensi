"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { submitLeaveRequest, type SubmitLeaveResult } from "@/lib/leave/submit";
import { notifyApproverOfLeave } from "@/lib/leave/notify";
import { LEAVE_ATTACHMENT_BUCKET } from "@/lib/leave/attachments";

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ATTACHMENT_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

  // Optional attachment. Uploaded with the service role into a per-employee
  // folder; the bucket has no client policies, so only the server can read it.
  const file = formData.get("lampiran");
  let lampiranPath: string | undefined;
  const service = createServiceRoleSupabaseClient();
  if (file instanceof File && file.size > 0) {
    const ext = ATTACHMENT_EXT[file.type];
    if (!ext) return { ok: false, error: "Lampiran harus PDF, JPG, PNG, atau WEBP." };
    if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Ukuran lampiran maksimal 3 MB." };
    lampiranPath = `${employee.id}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const { error: upErr } = await service.storage
      .from(LEAVE_ATTACHMENT_BUCKET)
      .upload(lampiranPath, file, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error("submitLeave: attachment upload failed", upErr);
      return { ok: false, error: "Gagal mengunggah lampiran. Coba lagi." };
    }
  }

  const result: SubmitLeaveResult = await submitLeaveRequest(db, {
    employeeId: employee.id,
    jenis,
    tanggalMulai,
    tanggalSelesai,
    alasan,
    lampiranUrl: lampiranPath,
  });

  if (!result.ok) {
    // Don't leave an orphaned file behind a rejected request.
    if (lampiranPath) {
      const { error: rmErr } = await service.storage.from(LEAVE_ATTACHMENT_BUCKET).remove([lampiranPath]);
      if (rmErr) console.error("submitLeave: orphan attachment cleanup failed", rmErr);
    }
    return { ok: false, error: result.error };
  }

  // Best effort: a mail failure must never undo a saved request.
  await notifyApproverOfLeave(result.requestId).catch((e) =>
    console.error("submitLeave: approver notification failed", e),
  );

  // The "Riwayat Pengajuan" list on this same page is a server-rendered read;
  // without this the client-driven submit leaves it showing stale data (the
  // just-submitted request missing) until a manual reload.
  revalidatePath("/cuti");
  return { ok: true };
}
