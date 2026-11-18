import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailBatch, escapeHtml } from "@/lib/email/send";
import { appUrl } from "@/lib/app-url";
import { monthLabel } from "@/lib/format/month";
import { paths } from "@/lib/routing/paths";

/**
 * Tells every active employee with a payslip in a just-finalized period that
 * it is ready. Finalizing is one-way (a final period can't be reopened), so
 * this runs once per period. The email carries no amounts — only a link to the
 * slip behind login. Needs the service role: HR can't read every employee's
 * email under RLS in all setups, and this runs after the response.
 */
export async function notifyPayslipsPublished(
  db: SupabaseClient,
  periodId: string,
): Promise<{ sent: number; failed: number }> {
  const [periodRes, slipRes] = await Promise.all([
    db.from("payroll_periods").select("bulan, tahun").eq("id", periodId).maybeSingle(),
    db.from("payslips").select("employees(nama, email, status)").eq("payroll_period_id", periodId),
  ]);
  if (periodRes.error || slipRes.error || !periodRes.data) {
    console.error("notifyPayslipsPublished: lookup failed", periodRes.error ?? slipRes.error ?? "period not found");
    return { sent: 0, failed: 0 };
  }
  const { bulan, tahun } = periodRes.data as { bulan: number; tahun: number };
  const periode = `${monthLabel(bulan)} ${tahun}`;
  const link = `${appUrl()}${paths.slipGaji(bulan, tahun)}`;

  type Emp = { nama: string; email: string; status: string };
  const recipients = ((slipRes.data ?? []) as unknown as { employees: Emp | Emp[] | null }[])
    .map((r) => (Array.isArray(r.employees) ? r.employees[0] : r.employees))
    .filter((e): e is Emp => !!e?.email && e.status === "aktif");

  return sendEmailBatch(
    recipients.map((e) => ({
      to: e.email,
      subject: `Slip gaji ${periode} sudah terbit`,
      text: `Halo ${e.nama},\n\nSlip gaji Anda untuk ${periode} sudah bisa dilihat dan diunduh.\n\nBuka: ${link}\n`,
      html:
        `<p>Halo ${escapeHtml(e.nama)},</p>` +
        `<p>Slip gaji Anda untuk <b>${escapeHtml(periode)}</b> sudah bisa dilihat dan diunduh.</p>` +
        `<p><a href="${escapeHtml(link)}">Lihat slip gaji</a></p>`,
    })),
  );
}
