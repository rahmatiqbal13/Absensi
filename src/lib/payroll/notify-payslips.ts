import type { SupabaseClient } from "@supabase/supabase-js";
import { monthLabel } from "@/lib/format/month";
import { paths } from "@/lib/routing/paths";
import { createNotifications } from "@/lib/notifications/create";

/**
 * An in-app notification for every active employee with a payslip in a
 * just-finalized period, linking to the slip (view + PDF download in menu
 * Slip Gaji). No amounts in the notice. Finalizing is one-way and the
 * notification is keyed by period, so each employee gets it once.
 * `db` must be the service-role client.
 */
export async function notifyPayslipsPublished(db: SupabaseClient, periodId: string): Promise<{ created: number }> {
  const [periodRes, slipRes] = await Promise.all([
    db.from("payroll_periods").select("bulan, tahun").eq("id", periodId).maybeSingle(),
    db.from("payslips").select("employee_id, employees(status)").eq("payroll_period_id", periodId),
  ]);
  if (periodRes.error || slipRes.error || !periodRes.data) {
    console.error("notifyPayslipsPublished: lookup failed", periodRes.error ?? slipRes.error ?? "period not found");
    return { created: 0 };
  }
  const { bulan, tahun } = periodRes.data as { bulan: number; tahun: number };
  const periode = `${monthLabel(bulan)} ${tahun}`;

  type Emp = { status: string };
  const recipients = ((slipRes.data ?? []) as unknown as { employee_id: string; employees: Emp | Emp[] | null }[])
    .filter((r) => (Array.isArray(r.employees) ? r.employees[0] : r.employees)?.status === "aktif")
    .map((r) => r.employee_id);

  const res = await createNotifications(
    db,
    recipients.map((employee_id) => ({
      employee_id,
      jenis: "slip_gaji",
      kunci: periodId,
      judul: `Slip gaji ${periode} sudah terbit`,
      isi: "Lihat dan unduh PDF-nya di menu Slip Gaji.",
      link: paths.slipGaji(bulan, tahun),
    })),
  );
  return { created: res.ok ? res.created : 0 };
}
