import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, escapeHtml, type EmailResult } from "@/lib/email/send";
import { appUrl } from "@/lib/app-url";

function fmtJam(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

function fmtTanggal(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Emails the assigned approver about a new correction request (best effort). */
export async function notifyApproverOfCorrection(service: SupabaseClient, correctionId: string): Promise<EmailResult> {
  const { data, error } = await service
    .from("attendance_corrections")
    .select(
      "tanggal, jam_masuk, jam_pulang, alasan, " +
        "requester:employees!attendance_corrections_employee_id_fkey(nama), " +
        "approver:employees!attendance_corrections_approver_id_fkey(nama, email, status)",
    )
    .eq("id", correctionId)
    .single();
  if (error || !data) return { sent: false, reason: "lookup-failed" };
  const row = data as unknown as {
    tanggal: string;
    jam_masuk: string;
    jam_pulang: string | null;
    alasan: string;
    requester: { nama: string } | null;
    approver: { nama: string; email: string; status: string } | null;
  };
  if (!row.approver?.email || row.approver.status !== "aktif") return { sent: false, reason: "no-approver" };

  const nama = row.requester?.nama ?? "Karyawan";
  const link = `${appUrl()}/persetujuan-koreksi?id=${correctionId}`;
  const lines = [
    `${nama} mengajukan koreksi absensi untuk ${fmtTanggal(row.tanggal)}.`,
    `Jam yang diajukan: masuk ${fmtJam(row.jam_masuk)}, pulang ${fmtJam(row.jam_pulang)}.`,
    `Alasan: ${row.alasan}`,
  ];
  return sendEmail({
    to: row.approver.email,
    subject: `Koreksi absensi: ${nama}`,
    text: `Halo ${row.approver.nama},\n\n${lines.join("\n")}\n\nTinjau di: ${link}\n`,
    html:
      `<p>Halo ${escapeHtml(row.approver.nama)},</p>` +
      lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
      `<p><a href="${escapeHtml(link)}">Tinjau pengajuan</a></p>`,
  });
}
