import { correctedStatus, jakartaInstant } from "@/lib/attendance/correction";
import type { AttendanceStatus } from "@/lib/attendance/status";

/**
 * Folds one employee's machine scans for one day into their attendance row.
 *
 * Rules (the same whether scans come from a USB file or the LAN bridge, and
 * safe to re-run — importing the same scans twice changes nothing):
 * - Every known time of the day counts: the machine scans plus the jam masuk /
 *   pulang already recorded from the app (GPS / QR). Jam masuk = the earliest.
 *   Jam pulang = the FIRST time from PULANG_WINDOW_MIN before the scheduled
 *   jam pulang onwards, so scanning again later never moves it (every scan is
 *   still kept in mesin_scans). Before that window a scan may be a lunch break,
 *   so it only counts when nothing falls in the window (early leave) — then the
 *   latest one. Either way at least MIN_GAP_SEC after jam masuk (a double tap
 *   at the machine is not a clock-out).
 * - A half HR set by hand (metode 'koreksi') is never overwritten.
 * - Status is recomputed from the day's schedule like a correction; if a GPS
 *   half that was outside the geofence is kept, the day stays di_luar_lokasi.
 */
export const MIN_GAP_SEC = 60;
/** Scans from this many minutes before the scheduled jam pulang count as the clock-out. */
export const PULANG_WINDOW_MIN = 60;

const WIB_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });

export type ExistingDay = {
  jam_masuk: string | null;
  jam_pulang: string | null;
  metode_masuk: string | null;
  metode_pulang: string | null;
  status: string;
};

export type DaySchedule = { jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number };

export type MergedDay = {
  jamMasuk: string;
  jamPulang: string | null;
  metodeMasuk: string;
  metodePulang: string | null;
  status: AttendanceStatus;
  /** "baru" = no row yet, "ubah" = row changes, "tetap" = nothing to write. */
  aksi: "baru" | "ubah" | "tetap";
};

type Stamp = { t: number; iso: string; metode: string };

export function mergeMachineDay(existing: ExistingDay | null, scans: readonly string[], schedule: DaySchedule): MergedDay | null {
  // An "alpa" placeholder without times is no attendance at all.
  const ex = existing && (existing.jam_masuk || existing.jam_pulang) ? existing : null;
  const stamp = (iso: string, metode: string): Stamp => ({ t: Date.parse(iso), iso: new Date(iso).toISOString(), metode });

  const candidates: Stamp[] = scans.map((s) => stamp(s, "mesin"));
  const fixedMasuk = ex?.metode_masuk === "koreksi" && ex.jam_masuk ? stamp(ex.jam_masuk, "koreksi") : null;
  const fixedPulang = ex?.metode_pulang === "koreksi" && ex.jam_pulang ? stamp(ex.jam_pulang, "koreksi") : null;
  if (ex?.jam_masuk && !fixedMasuk) candidates.push(stamp(ex.jam_masuk, ex.metode_masuk ?? "gps"));
  if (ex?.jam_pulang && !fixedPulang) candidates.push(stamp(ex.jam_pulang, ex.metode_pulang ?? "gps"));
  if (candidates.length === 0 && !fixedMasuk) return null;

  const earliest = (list: Stamp[]) => list.reduce((a, b) => (b.t < a.t ? b : a));
  const latest = (list: Stamp[]) => list.reduce((a, b) => (b.t > a.t ? b : a));

  const masuk = fixedMasuk ?? earliest(candidates);
  let pulang: Stamp | null = fixedPulang;
  if (!pulang) {
    const later = candidates.filter((c) => c.t - masuk.t >= MIN_GAP_SEC * 1000);
    // Shifts end on the day they start (0059), so the window is on jam masuk's WIB day.
    const windowStart =
      Date.parse(jakartaInstant(WIB_DATE.format(new Date(masuk.t)), schedule.jam_pulang)) - PULANG_WINDOW_MIN * 60_000;
    const inWindow = later.filter((c) => c.t >= windowStart);
    pulang = inWindow.length ? earliest(inWindow) : later.length ? latest(later) : null;
  }

  let status = correctedStatus({ jamMasukIso: masuk.iso, jamPulangIso: pulang?.iso ?? null, schedule });
  const keptAppHalf = [masuk, pulang].some((s) => s && s.metode !== "mesin" && s.metode !== "koreksi");
  if (ex?.status === "di_luar_lokasi" && keptAppHalf) status = "di_luar_lokasi";

  const same = (a: string | null | undefined, b: string | null | undefined) =>
    (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null);
  // Rows from before metode existed (0031) count as GPS, as above.
  const metodeOf = (time: string | null, metode: string | null) => (time ? metode ?? "gps" : null);
  const aksi: MergedDay["aksi"] = !existing
    ? "baru"
    : same(existing.jam_masuk, masuk.iso) &&
        same(existing.jam_pulang, pulang?.iso ?? null) &&
        existing.status === status &&
        metodeOf(existing.jam_masuk, existing.metode_masuk) === masuk.metode &&
        metodeOf(existing.jam_pulang, existing.metode_pulang) === (pulang?.metode ?? null)
      ? "tetap"
      : "ubah";

  return {
    jamMasuk: masuk.iso,
    jamPulang: pulang?.iso ?? null,
    metodeMasuk: masuk.metode,
    metodePulang: pulang?.metode ?? null,
    status,
    aksi,
  };
}
