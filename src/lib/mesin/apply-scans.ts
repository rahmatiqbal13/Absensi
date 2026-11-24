import type { SupabaseClient } from "@supabase/supabase-js";
import { loadScheduleAssignments, loadSchedules, pickSchedule } from "@/lib/schedule/resolve";
import { loadRoster } from "@/lib/schedule/roster";
import { mergeMachineDay, type DaySchedule, type ExistingDay } from "./merge-day";

/**
 * Applies machine scans (from a USB log file or the office LAN bridge) to
 * attendances. Takes the SERVICE-ROLE client — callers authenticate first
 * (HR session for the file import, the bridge token for the API).
 *
 * With `dryRun` nothing is written: the result is the preview HR checks
 * before importing.
 */
export type ScanInput = { pin: string; waktu: string; namaMesin?: string; sn?: string | null };

export type DayOutcome = {
  employeeId: string;
  nama: string;
  pin: string;
  tanggal: string;
  /** Scan times of this day, ISO. */
  scans: string[];
  jamMasuk: string | null;
  jamPulang: string | null;
  status: string | null;
  aksi: "baru" | "ubah" | "tetap" | "lewati";
  alasan?: string;
};

export type UnmappedPin = { pin: string; namaMesin: string; jumlahScan: number };

export type ApplyResult =
  | {
      ok: true;
      days: DayOutcome[];
      unmapped: UnmappedPin[];
      /** Raw scans newly stored (0 on a dry run or when all were imported before). */
      scanBaru: number;
      ditulis: number;
    }
  | { ok: false; error: string };

const WIB_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const wibDate = (iso: string) => WIB_DATE.format(new Date(iso));

const MAX_SCANS = 20_000;

export async function applyMachineScans(
  service: SupabaseClient,
  input: readonly ScanInput[],
  opts: { sumber: "file" | "jaringan"; actorId: string | null; dryRun: boolean; keterangan?: string },
): Promise<ApplyResult> {
  if (input.length === 0) return { ok: true, days: [], unmapped: [], scanBaru: 0, ditulis: 0 };
  if (input.length > MAX_SCANS) return { ok: false, error: `Terlalu banyak scan sekaligus (maks ${MAX_SCANS}).` };

  // Dedupe identical scans (the same file imported twice in one batch, etc.).
  const scans = [...new Map(input.map((s) => [`${s.pin}|${Date.parse(s.waktu)}`, s])).values()];
  const pins = [...new Set(scans.map((s) => s.pin))];

  const { data: emps, error: empErr } = await service
    .from("employees")
    .select("id, nama, pin_mesin, branch_id, department_id")
    .in("pin_mesin", pins);
  if (empErr) {
    console.error("applyMachineScans: employee lookup failed", empErr);
    return { ok: false, error: "Gagal memuat data pegawai. Pastikan migrasi 0061 sudah dijalankan." };
  }
  type Emp = { id: string; nama: string; pin_mesin: string; branch_id: string; department_id: string | null };
  const byPin = new Map((emps as Emp[]).map((e) => [e.pin_mesin, e]));

  // Group by employee + WIB day; collect PINs nobody owns yet.
  const groups = new Map<string, { emp: Emp; tanggal: string; scans: string[] }>();
  const unmapped = new Map<string, UnmappedPin>();
  for (const s of scans) {
    const emp = byPin.get(s.pin);
    if (!emp) {
      const u = unmapped.get(s.pin) ?? { pin: s.pin, namaMesin: s.namaMesin ?? "", jumlahScan: 0 };
      u.jumlahScan += 1;
      if (!u.namaMesin && s.namaMesin) u.namaMesin = s.namaMesin;
      unmapped.set(s.pin, u);
      continue;
    }
    const tanggal = wibDate(s.waktu);
    const key = `${emp.id}|${tanggal}`;
    const g = groups.get(key) ?? { emp, tanggal, scans: [] };
    g.scans.push(new Date(s.waktu).toISOString());
    groups.set(key, g);
  }

  let scanBaru = 0;
  if (!opts.dryRun) {
    const rows = scans.map((s) => ({
      pin: s.pin,
      waktu: new Date(s.waktu).toISOString(),
      sn: s.sn ?? null,
      sumber: opts.sumber,
      employee_id: byPin.get(s.pin)?.id ?? null,
      diimpor_oleh: opts.actorId,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await service
        .from("mesin_scans")
        .upsert(rows.slice(i, i + 500), { onConflict: "pin,waktu", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.error("applyMachineScans: raw scan insert failed", error);
        return { ok: false, error: "Gagal menyimpan data scan mesin." };
      }
      scanBaru += data?.length ?? 0;
    }
  }

  const list = [...groups.values()];
  if (list.length === 0) {
    return { ok: true, days: [], unmapped: [...unmapped.values()], scanBaru, ditulis: 0 };
  }
  const empIds = [...new Set(list.map((g) => g.emp.id))];
  const branchIds = [...new Set(list.map((g) => g.emp.branch_id))];
  const dates = list.map((g) => g.tanggal).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  const [schedRes, roster, payrollRes, attRes, assigned] = await Promise.all([
    loadSchedules<{ jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number }>(
      service,
      "jam_masuk, jam_pulang, toleransi_terlambat_menit",
      branchIds,
    ),
    loadRoster(service, empIds, from, to),
    service.from("payroll_periods").select("branch_id, bulan, tahun").eq("status", "final").in("branch_id", branchIds),
    service
      .from("attendances")
      .select("employee_id, tanggal, jam_masuk, jam_pulang, metode_masuk, metode_pulang, status")
      .in("employee_id", empIds)
      .gte("tanggal", from)
      .lte("tanggal", to),
    loadScheduleAssignments(service, empIds),
  ]);
  if (schedRes.error || payrollRes.error || attRes.error) {
    console.error("applyMachineScans: reference lookup failed", {
      schedule: schedRes.error, payroll: payrollRes.error, attendance: attRes.error,
    });
    return { ok: false, error: "Gagal memuat jadwal / absensi yang ada." };
  }
  const finals = new Set(
    ((payrollRes.data ?? []) as { branch_id: string; bulan: number; tahun: number }[]).map(
      (p) => `${p.branch_id}|${p.tahun}-${String(p.bulan).padStart(2, "0")}`,
    ),
  );
  const existing = new Map(
    ((attRes.data ?? []) as (ExistingDay & { employee_id: string; tanggal: string })[]).map((a) => [
      `${a.employee_id}|${a.tanggal}`,
      a,
    ]),
  );

  const days: DayOutcome[] = [];
  let ditulis = 0;
  list.sort((a, b) => a.emp.nama.localeCompare(b.emp.nama) || a.tanggal.localeCompare(b.tanggal));
  for (const g of list) {
    g.scans.sort();
    const base = { employeeId: g.emp.id, nama: g.emp.nama, pin: g.emp.pin_mesin, tanggal: g.tanggal, scans: g.scans };
    const skip = (alasan: string): DayOutcome => ({ ...base, jamMasuk: null, jamPulang: null, status: null, aksi: "lewati", alasan });

    if (finals.has(`${g.emp.branch_id}|${g.tanggal.slice(0, 7)}`)) {
      days.push(skip("Payroll bulan ini sudah final"));
      continue;
    }
    const regular = pickSchedule(schedRes.data, g.emp.branch_id, g.emp.department_id, assigned.get(g.emp.id));
    if (!regular) {
      days.push(skip("Jadwal kerja belum diatur"));
      continue;
    }
    // That day's rostered shift (0059) is the yardstick; a rostered libur keeps the regular times.
    const shift = roster.get(g.emp.id)?.get(g.tanggal);
    const schedule: DaySchedule = shift
      ? { jam_masuk: `${shift.jamMasuk}:00`, jam_pulang: `${shift.jamPulang}:00`, toleransi_terlambat_menit: shift.toleransiMenit }
      : regular;

    const key = `${g.emp.id}|${g.tanggal}`;
    const before = existing.get(key) ?? null;
    const merged = mergeMachineDay(before, g.scans, schedule);
    if (!merged) {
      days.push(skip("Tidak ada jam yang bisa dipakai"));
      continue;
    }
    days.push({ ...base, jamMasuk: merged.jamMasuk, jamPulang: merged.jamPulang, status: merged.status, aksi: merged.aksi });
    if (opts.dryRun || merged.aksi === "tetap") continue;

    const values = {
      jam_masuk: merged.jamMasuk,
      jam_pulang: merged.jamPulang,
      metode_masuk: merged.metodeMasuk,
      metode_pulang: merged.metodePulang,
      status: merged.status,
    };
    const { error } = before
      ? await service.from("attendances").update(values).eq("employee_id", g.emp.id).eq("tanggal", g.tanggal)
      : await service.from("attendances").insert({ employee_id: g.emp.id, tanggal: g.tanggal, ...values });
    if (error) {
      console.error("applyMachineScans: attendance write failed", { key, error });
      days[days.length - 1] = skip("Gagal menyimpan");
      continue;
    }
    ditulis += 1;
  }

  // The LAN bridge re-sends often; only log batches that brought something new.
  if (!opts.dryRun && (scanBaru > 0 || ditulis > 0)) {
    const { error: auditErr } = await service.from("audit_logs").insert({
      actor_id: opts.actorId,
      target_employee_id: null,
      aksi: "mesin_absensi_import",
      detail: {
        sumber: opts.sumber,
        scan: scans.length,
        scan_baru: scanBaru,
        hari_ditulis: ditulis,
        dari: from,
        sampai: to,
        pin_belum_terdaftar: [...unmapped.keys()],
        ...(opts.keterangan ? { keterangan: opts.keterangan } : {}),
      },
    });
    if (auditErr) console.error("applyMachineScans: audit insert failed", auditErr);
  }

  return { ok: true, days, unmapped: [...unmapped.values()], scanBaru, ditulis };
}
