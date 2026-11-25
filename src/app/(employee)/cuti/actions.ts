"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { submitLeaveRequest, type SubmitLeaveResult } from "@/lib/leave/submit";
import { notifyApproverOfLeave } from "@/lib/leave/notify";
import { LEAVE_ATTACHMENT_BUCKET } from "@/lib/leave/attachments";
import { calculateLeaveDays, requiresBalanceCheck } from "@/lib/leave/balance";
import { countWorkingDays } from "@/lib/leave/balance";
import { getLeaveBalance } from "@/lib/leave/balance-lookup";
import { loadEmployeeSchedule } from "@/lib/schedule/resolve";
import { isMagang } from "@/lib/employees/contracts";

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

const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  "leave has already started": "Cuti yang sudah berjalan tidak bisa dibatalkan. Hubungi HR.",
  "leave request cannot be cancelled": "Pengajuan ini tidak bisa dibatalkan.",
  "leave request not found": "Pengajuan cuti tidak ditemukan.",
};

/**
 * Cancel the caller's own leave request (pending, or approved but not yet
 * started). Ownership, status rules and the annual-leave refund all live in
 * the cancel_leave_request RPC (migration 0040), so they hold server-side.
 */
export async function cancelLeave(requestId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) return { ok: false, error: "Anda belum masuk. Silakan login ulang." };

  const { error } = await db.rpc("cancel_leave_request", { p_request_id: requestId });
  if (error) {
    const known = Object.entries(CANCEL_ERROR_MESSAGES).find(([key]) => error.message?.includes(key));
    if (!known) console.error("cancelLeave: unmapped RPC error", error);
    return { ok: false, error: known?.[1] ?? "Gagal membatalkan pengajuan cuti." };
  }
  revalidatePath("/cuti");
  return { ok: true };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type LeaveDaysPreview =
  | {
      ok: true;
      /** Scheduled working days in the range (holidays excluded) — the days actually off. */
      workingDays: number;
      /** What approval deducts from the annual balance (working days, 0069); null for types without a balance. */
      chargedDays: number | null;
      /** Annual balance left before this request; null for types without a balance. */
      sisa: number | null;
    }
  | { ok: false };

/**
 * Live count under the leave form's dates. Same rules as the approver's
 * review panel (review-context.ts): working days from the employee's schedule
 * minus holidays — also what approve_leave_request charges (0069).
 */
export async function previewLeaveDays(jenis: string, from: string, to: string): Promise<LeaveDaysPreview> {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) return { ok: false };
  if (calculateLeaveDays(from, to) > 366) return { ok: false };
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) return { ok: false };

  const [sched, hol] = await Promise.all([
    loadEmployeeSchedule<{ hari_kerja: number[] | null }>(db, "hari_kerja", employee.branchId, employee.departmentId, employee.id),
    db
      .from("holidays")
      .select("tanggal, branch_id")
      .gte("tanggal", from)
      .lte("tanggal", to),
  ]);
  if (sched.error || hol.error) {
    console.error("previewLeaveDays: lookup failed", sched.error ?? hol.error);
    return { ok: false };
  }
  const holidays = (hol.data ?? [])
    .filter((h) => h.branch_id === null || h.branch_id === employee.branchId)
    .map((h) => h.tanggal as string);
  const workingDays = countWorkingDays(from, to, sched.data?.hari_kerja ?? [1, 2, 3, 4, 5], holidays);

  if (!requiresBalanceCheck(jenis)) return { ok: true, workingDays, chargedDays: null, sisa: null };
  const bal = await getLeaveBalance(db, employee.id, Number(from.slice(0, 4)), {
    magang: isMagang(employee.statusKontrak),
  });
  return {
    ok: true,
    workingDays,
    chargedDays: workingDays,
    sisa: bal.ok ? bal.balance.sisa : null,
  };
}
