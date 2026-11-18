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

/** "2 tahun 3 bulan" from a day count (30-day months, for display only). */
export function formatLamaHari(days: number): string {
  const tahun = Math.floor(days / 365);
  const bulan = Math.floor((days % 365) / 30);
  const parts = [tahun ? `${tahun} tahun` : null, bulan ? `${bulan} bulan` : null].filter(Boolean);
  return parts.length ? parts.join(" ") : `${days} hari`;
}
