import type { SupabaseClient } from "@supabase/supabase-js";
import { applyMachineScans } from "./apply-scans";

/**
 * Re-applies the machine scans already stored in mesin_scans for one branch
 * and month to attendances. Used after a payroll period is reopened: scans that
 * arrived while the month was final were stored but skipped, and now belong in
 * the attendance. Idempotent (applyMachineScans only writes what changes).
 *
 * `service` = service-role client; the caller has checked HR.
 */
export async function reprocessStoredScans(
  service: SupabaseClient,
  opts: { branchId: string; tahun: number; bulan: number; actorId: string | null },
): Promise<{ ok: true; scan: number; ditulis: number } | { ok: false; error: string }> {
  const { data: emps, error: empErr } = await service
    .from("employees")
    .select("pin_mesin")
    .eq("branch_id", opts.branchId)
    .not("pin_mesin", "is", null);
  if (empErr) return { ok: false, error: "Gagal memuat PIN mesin pegawai." };
  const pins = ((emps ?? []) as { pin_mesin: string }[]).map((e) => e.pin_mesin);
  if (pins.length === 0) return { ok: true, scan: 0, ditulis: 0 };

  // The month in WIB: [1st 00:00, next 1st 00:00) +07:00.
  const mm = String(opts.bulan).padStart(2, "0");
  const next = opts.bulan === 12 ? `${opts.tahun + 1}-01` : `${opts.tahun}-${String(opts.bulan + 1).padStart(2, "0")}`;
  const from = new Date(`${opts.tahun}-${mm}-01T00:00:00+07:00`).toISOString();
  const to = new Date(`${next}-01T00:00:00+07:00`).toISOString();

  const scans: { pin: string; waktu: string; sn: string | null }[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await service
      .from("mesin_scans")
      .select("pin, waktu, sn")
      .in("pin", pins)
      .gte("waktu", from)
      .lt("waktu", to)
      .order("waktu", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { ok: false, error: "Gagal memuat scan mesin tersimpan." };
    scans.push(...((data ?? []) as typeof scans));
    if (!data || data.length < PAGE) break;
  }
  if (scans.length === 0) return { ok: true, scan: 0, ditulis: 0 };

  const res = await applyMachineScans(service, scans, {
    sumber: "jaringan",
    actorId: opts.actorId,
    dryRun: false,
    keterangan: `Scan tersimpan diproses ulang setelah payroll ${mm}/${opts.tahun} dibuka kembali`,
  });
  if (!res.ok) return res;
  return { ok: true, scan: scans.length, ditulis: res.ditulis };
}
