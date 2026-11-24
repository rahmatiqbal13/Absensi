import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSchedules, pickSchedule } from "@/lib/schedule/resolve";
import { loadRoster } from "@/lib/schedule/roster";
import { mergeMachineDay, type DaySchedule, type ExistingDay } from "./merge-day";

/**
 * Undoes a wrong PIN pairing: the PIN's scans stop belonging to the employee
 * (mesin_scans.employee_id back to null, so they wait for the right person and
 * move over when HR pairs the PIN again), and every attendance day they wrote
 * loses its machine halves.
 *
 * Per day: halves with metode 'mesin' are dropped; what the employee recorded in
 * the app (GPS / QR) or HR set by hand ('koreksi') stays, and the status is
 * recomputed from it. A day that only had machine times is deleted. Months with
 * a final payroll are left as they are (reported back).
 */
export type StrippedDay =
  | { aksi: "hapus" }
  | { aksi: "tetap" }
  | {
      aksi: "ubah";
      values: { jam_masuk: string | null; jam_pulang: string | null; metode_masuk: string | null; metode_pulang: string | null; status: string };
    };

export function stripMachineDay(existing: ExistingDay, schedule: DaySchedule): StrippedDay {
  const machineMasuk = existing.metode_masuk === "mesin";
  const machinePulang = existing.metode_pulang === "mesin";
  if (!machineMasuk && !machinePulang) return { aksi: "tetap" };
  const rest: ExistingDay = {
    ...existing,
    jam_masuk: machineMasuk ? null : existing.jam_masuk,
    metode_masuk: machineMasuk ? null : existing.metode_masuk,
    jam_pulang: machinePulang ? null : existing.jam_pulang,
    metode_pulang: machinePulang ? null : existing.metode_pulang,
  };
  if (!rest.jam_masuk && !rest.jam_pulang) return { aksi: "hapus" };
  // Rebuild from what is left (no scans): the earliest remaining time is jam masuk.
  const merged = mergeMachineDay(rest, [], schedule);
  if (!merged) {
    // Only an HR-set jam pulang is left: never delete HR's correction, just drop the machine half.
    return {
      aksi: "ubah",
      values: {
        jam_masuk: rest.jam_masuk,
        jam_pulang: rest.jam_pulang,
        metode_masuk: rest.metode_masuk,
        metode_pulang: rest.metode_pulang,
        status: existing.status,
      },
    };
  }
  return {
    aksi: "ubah",
    values: {
      jam_masuk: merged.jamMasuk,
      jam_pulang: merged.jamPulang,
      metode_masuk: merged.metodeMasuk,
      metode_pulang: merged.metodePulang,
      status: merged.status,
    },
  };
}

const WIB_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });

export type DetachResult =
  | { ok: true; scanDilepas: number; hariDihapus: number; hariDiubah: number; hariDilewati: number }
  | { ok: false; error: string };

/** `service` = service-role client. Call BEFORE clearing / changing the employee's pin_mesin. */
export async function detachMachineScans(service: SupabaseClient, employeeId: string, pin: string): Promise<DetachResult> {
  const { data: emp, error: empErr } = await service
    .from("employees")
    .select("id, branch_id, department_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr || !emp) return { ok: false, error: "Pegawai tidak ditemukan." };

  const { data: scans, error: scanErr } = await service
    .from("mesin_scans")
    .update({ employee_id: null })
    .eq("employee_id", employeeId)
    .eq("pin", pin)
    .select("waktu");
  if (scanErr) {
    console.error("detachMachineScans: unlinking scans failed", scanErr);
    return { ok: false, error: "Gagal melepas scan mesin dari pegawai." };
  }
  const dates = [...new Set(((scans ?? []) as { waktu: string }[]).map((s) => WIB_DATE.format(new Date(s.waktu))))].sort();
  const result = { ok: true as const, scanDilepas: scans?.length ?? 0, hariDihapus: 0, hariDiubah: 0, hariDilewati: 0 };
  if (dates.length === 0) return result;

  const from = dates[0];
  const to = dates[dates.length - 1];
  const [schedRes, roster, payrollRes, attRes] = await Promise.all([
    loadSchedules<DaySchedule>(service, "jam_masuk, jam_pulang, toleransi_terlambat_menit", [emp.branch_id]),
    loadRoster(service, [employeeId], from, to),
    service.from("payroll_periods").select("bulan, tahun").eq("status", "final").eq("branch_id", emp.branch_id),
    service
      .from("attendances")
      .select("tanggal, jam_masuk, jam_pulang, metode_masuk, metode_pulang, status")
      .eq("employee_id", employeeId)
      .in("tanggal", dates),
  ]);
  if (schedRes.error || payrollRes.error || attRes.error) {
    console.error("detachMachineScans: reference lookup failed", { s: schedRes.error, p: payrollRes.error, a: attRes.error });
    return { ok: false, error: "Scan sudah dilepas, tetapi absensinya gagal dirapikan. Coba lagi." };
  }
  const finals = new Set(
    ((payrollRes.data ?? []) as { bulan: number; tahun: number }[]).map((p) => `${p.tahun}-${String(p.bulan).padStart(2, "0")}`),
  );
  const regular = pickSchedule(schedRes.data, emp.branch_id, emp.department_id);

  for (const day of (attRes.data ?? []) as (ExistingDay & { tanggal: string })[]) {
    if (finals.has(day.tanggal.slice(0, 7))) {
      if (day.metode_masuk === "mesin" || day.metode_pulang === "mesin") result.hariDilewati += 1;
      continue;
    }
    const shift = roster.get(employeeId)?.get(day.tanggal);
    const schedule: DaySchedule | null = shift
      ? { jam_masuk: `${shift.jamMasuk}:00`, jam_pulang: `${shift.jamPulang}:00`, toleransi_terlambat_menit: shift.toleransiMenit }
      : regular;
    const stripped: StrippedDay = schedule
      ? stripMachineDay(day, schedule)
      : day.metode_masuk === "mesin" && (day.metode_pulang === "mesin" || !day.jam_pulang)
        ? { aksi: "hapus" }
        : { aksi: "tetap" };
    if (stripped.aksi === "tetap") continue;
    const q = service.from("attendances");
    const { error } =
      stripped.aksi === "hapus"
        ? await q.delete().eq("employee_id", employeeId).eq("tanggal", day.tanggal)
        : await q.update(stripped.values).eq("employee_id", employeeId).eq("tanggal", day.tanggal);
    if (error) {
      console.error("detachMachineScans: attendance write failed", { tanggal: day.tanggal, error });
      result.hariDilewati += 1;
    } else if (stripped.aksi === "hapus") result.hariDihapus += 1;
    else result.hariDiubah += 1;
  }
  return result;
}
