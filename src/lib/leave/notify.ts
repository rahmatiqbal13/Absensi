import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { sendEmail, escapeHtml, type EmailResult } from "@/lib/email/send";
import { formatLeaveRange, leaveJenisLabel } from "./labels";

/**
 * Emails the approver of a freshly submitted leave request (PRD §6: "Notifikasi
 * ke atasan saat ada pengajuan baru"). Reads with the service role because the
 * requester cannot see the approver's email under RLS.
 */
export async function notifyApproverOfLeave(requestId: string): Promise<EmailResult> {
  const service = createServiceRoleSupabaseClient();
  const { data, error } = await service
    .from("leave_requests")
    .select(
      "id, jenis, tanggal_mulai, tanggal_selesai, alasan, lampiran_url, " +
        "requester:employees!leave_requests_employee_id_fkey(nama), " +
        "approver:employees!leave_requests_approver_id_fkey(nama, email, status)",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data) {
    console.error("notifyApproverOfLeave: lookup failed", error);
    return { sent: false, reason: "lookup" };
  }
  const row = data as unknown as {
    jenis: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    alasan: string | null;
    lampiran_url: string | null;
    requester: { nama: string } | null;
    approver: { nama: string; email: string; status: string } | null;
  };
  if (!row.approver?.email || row.approver.status !== "aktif") return { sent: false, reason: "no-approver" };

  const nama = row.requester?.nama ?? "Karyawan";
  const jenis = leaveJenisLabel(row.jenis);
  const range = formatLeaveRange(row.tanggal_mulai, row.tanggal_selesai);
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
  const link = `${base}/persetujuan-cuti?id=${requestId}`;

  const lines = [
    `${nama} mengajukan ${jenis} untuk ${range}.`,
    row.alasan ? `Alasan: ${row.alasan}` : null,
    row.lampiran_url ? "Lampiran tersedia di aplikasi." : null,
  ].filter(Boolean) as string[];

  return sendEmail({
    to: row.approver.email,
    subject: `Pengajuan cuti baru: ${nama} · ${jenis}`,
    text: `Halo ${row.approver.nama},\n\n${lines.join("\n")}\n\nTinjau di: ${link}\n`,
    html:
      `<p>Halo ${escapeHtml(row.approver.nama)},</p>` +
      lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
      `<p><a href="${escapeHtml(link)}">Tinjau pengajuan</a></p>`,
  });
}
