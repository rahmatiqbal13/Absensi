/**
 * Employment contracts (migration 0049). A contract is PKWT (fixed term),
 * PKWTT (permanent, no end date) or magang (internship, fixed term).
 * "Kontrak ke-N" counts PKWT contracts; every PKWT after the first is an
 * extension. PP 35/2021: PKWT may run at most 5 years in total, extensions
 * included.
 */
export type ContractJenis = "pkwt" | "pkwtt" | "magang";

export type Contract = {
  id: string;
  jenis: ContractJenis;
  /** "YYYY-MM-DD" */
  tanggal_mulai: string;
  tanggal_selesai: string | null;
  catatan: string | null;
};

export const CONTRACT_LABEL: Record<ContractJenis, string> = {
  pkwt: "PKWT (kontrak)",
  pkwtt: "PKWTT (tetap)",
  magang: "Magang",
};

/** What employees.status_kontrak becomes when this is the latest contract. */
export const STATUS_KONTRAK_FOR: Record<ContractJenis, string> = {
  pkwt: "PKWT",
  pkwtt: "tetap",
  magang: "Magang",
};

/** Interns don't get payroll or the Slip Gaji menu. */
export function isMagang(statusKontrak: string | null | undefined): boolean {
  return /magang/i.test(statusKontrak ?? "");
}

export const PKWT_MAX_DAYS = 5 * 365;
/** Warn when total PKWT time is within half a year of the 5-year cap. */
const PKWT_WARN_DAYS = PKWT_MAX_DAYS - 182;

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY);
}
export function addDays(d: string, n: number): string {
  return new Date(toTime(d) + n * DAY).toISOString().slice(0, 10);
}

export type ContractState = "belum_ada" | "tetap" | "aktif" | "segera_berakhir" | "berakhir" | "belum_mulai";

export type ContractSummary = {
  /** The contract with the latest start date, if any. */
  current: Contract | null;
  state: ContractState;
  /** Days until the current contract ends (negative = ended); null without an end. */
  sisaHari: number | null;
  /** 1-based count of PKWT contracts (0 when none). */
  kontrakKe: number;
  /** PKWT extensions = PKWT contracts after the first. */
  perpanjangan: number;
  /** Total PKWT days across all PKWT contracts. */
  totalPkwtHari: number;
  /** Total PKWT time is close to or over the 5-year limit. */
  mendekatiBatasPkwt: boolean;
};

export const SOON_DAYS = 30;

export function sortContracts(list: readonly Contract[]): Contract[] {
  return [...list].sort((a, b) => b.tanggal_mulai.localeCompare(a.tanggal_mulai));
}

export function summarizeContracts(list: readonly Contract[], today: string): ContractSummary {
  const sorted = sortContracts(list);
  const current = sorted[0] ?? null;
  const pkwt = sorted.filter((c) => c.jenis === "pkwt");
  const totalPkwtHari = pkwt.reduce(
    (sum, c) => sum + (c.tanggal_selesai ? daysBetween(c.tanggal_mulai, c.tanggal_selesai) + 1 : 0),
    0,
  );

  let state: ContractState = "belum_ada";
  let sisaHari: number | null = null;
  if (current) {
    if (!current.tanggal_selesai) state = "tetap";
    else {
      sisaHari = daysBetween(today, current.tanggal_selesai);
      state =
        current.tanggal_mulai > today
          ? "belum_mulai"
          : sisaHari < 0
            ? "berakhir"
            : sisaHari <= SOON_DAYS
              ? "segera_berakhir"
              : "aktif";
    }
  }

  return {
    current,
    state,
    sisaHari,
    kontrakKe: pkwt.length,
    perpanjangan: Math.max(0, pkwt.length - 1),
    totalPkwtHari,
    mendekatiBatasPkwt: totalPkwtHari >= PKWT_WARN_DAYS,
  };
}

export type ContractInput = {
  jenis: ContractJenis;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  catatan: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateContractInput(raw: {
  jenis: unknown;
  tanggalMulai: unknown;
  tanggalSelesai: unknown;
  catatan: unknown;
}): { ok: true; value: ContractInput } | { ok: false; error: string } {
  const jenis = String(raw.jenis ?? "");
  if (jenis !== "pkwt" && jenis !== "pkwtt" && jenis !== "magang") return { ok: false, error: "Pilih jenis kontrak." };
  const mulai = String(raw.tanggalMulai ?? "");
  if (!DATE_RE.test(mulai)) return { ok: false, error: "Tanggal mulai wajib diisi." };
  const selesaiRaw = String(raw.tanggalSelesai ?? "").trim();
  const selesai = selesaiRaw === "" ? null : selesaiRaw;
  if (selesai !== null && !DATE_RE.test(selesai)) return { ok: false, error: "Tanggal selesai tidak valid." };
  if (jenis !== "pkwtt" && !selesai) return { ok: false, error: "Tanggal selesai wajib diisi untuk PKWT dan magang." };
  if (selesai && selesai < mulai) return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  const catatan = String(raw.catatan ?? "").trim().slice(0, 500) || null;
  return { ok: true, value: { jenis, tanggalMulai: mulai, tanggalSelesai: jenis === "pkwtt" ? null : selesai, catatan } };
}

export type ReminderStage = "H30" | "H7" | "berakhir";

/**
 * Which reminder applies to an employee's latest contract today. Windows (not
 * exact days) so a missed cron run still sends it; the caller keys each stage
 * per contract so it is sent once.
 */
export function contractReminderStage(current: Contract | null, today: string): ReminderStage | null {
  if (!current?.tanggal_selesai || current.tanggal_mulai > today) return null;
  const sisa = daysBetween(today, current.tanggal_selesai);
  if (sisa < 0) return "berakhir";
  if (sisa <= 7) return "H7";
  if (sisa <= SOON_DAYS) return "H30";
  return null;
}

export function formatTanggal(d: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );
}

/** Whole calendar months from `from` up to (not including) `to`. */
function fullMonths(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/**
 * Calendar length "3 tahun 4 bulan" from `from` to `to` (exclusive). Used for
 * masa kerja (start date → today) and contract length (start → end + 1 day,
 * so 1 Jan–31 Des reads "1 tahun").
 */
export function formatLama(from: string, to: string): string {
  const months = fullMonths(from, to);
  if (months <= 0) {
    const days = Math.max(0, daysBetween(from, to));
    return `${days} hari`;
  }
  const tahun = Math.floor(months / 12);
  const bulan = months % 12;
  return [tahun ? `${tahun} tahun` : null, bulan ? `${bulan} bulan` : null].filter(Boolean).join(" ");
}

/** Length of a contract with an inclusive end date. */
export function formatLamaKontrak(c: Pick<Contract, "tanggal_mulai" | "tanggal_selesai">): string | null {
  return c.tanggal_selesai ? formatLama(c.tanggal_mulai, addDays(c.tanggal_selesai, 1)) : null;
}

/** "2 tahun 3 bulan" for a total day count (sum of several contracts). */
export function formatLamaHari(days: number): string {
  return formatLama("2000-01-01", addDays("2000-01-01", days));
}

/**
 * The contract in force on `date` (latest one started on or before it), with
 * "kontrak ke-N" counted as of that date — for a payslip of a past month.
 */
export function contractOn(list: readonly Contract[], date: string): { contract: Contract; kontrakKe: number } | null {
  const started = sortContracts(list).filter((c) => c.tanggal_mulai <= date);
  const contract = started[0];
  if (!contract) return null;
  return { contract, kontrakKe: started.filter((c) => c.jenis === "pkwt").length };
}

/** For the payslip: { status: "PKWT ke-4", periode: "1 Januari 2026 – 31 Desember 2026" }. */
export function describeContract(contract: Contract, kontrakKe: number): { status: string; periode: string } {
  const status =
    contract.jenis === "pkwt" ? `PKWT ke-${kontrakKe}` : contract.jenis === "pkwtt" ? "PKWTT (tetap)" : "Magang";
  const periode = contract.tanggal_selesai
    ? `${formatTanggal(contract.tanggal_mulai)} – ${formatTanggal(contract.tanggal_selesai)}`
    : `sejak ${formatTanggal(contract.tanggal_mulai)}`;
  return { status, periode };
}
