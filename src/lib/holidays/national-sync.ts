import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Automatic national-holiday sync.
 *
 * Source: Google's public Indonesian holiday calendar (Indonesian-language
 * feed). It covers libur nasional *and* cuti bersama, including Islamic dates,
 * a year or so ahead. Entries are told apart by DESCRIPTION:
 *   "Hari libur nasional…" → a day off (kept; cuti bersama included)
 *   "Perayaan…"            → an observance, e.g. "1 Ramadan" (skipped)
 * Next-year dates may be tentative ("(belum pasti)"); the weekly re-sync
 * replaces them once the government fixes them.
 */
export const NATIONAL_HOLIDAY_FEED_URL =
  "https://calendar.google.com/calendar/ical/id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics";

export type FeedHoliday = { uid: string; tanggal: string; nama: string; tentative: boolean };

// RFC 5545: lines folded with CRLF + one space/tab; text escapes \, \; \n.
function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}
function unescapeText(v: string): string {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Parse the feed and keep only days off (libur nasional + cuti bersama). */
export function parseHolidayFeed(ics: string): FeedHoliday[] {
  const out: FeedHoliday[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) {
        const date = cur.DTSTART?.match(/^(\d{4})(\d{2})(\d{2})$/);
        const desc = cur.DESCRIPTION ?? "";
        const nama = cur.SUMMARY ?? "";
        if (date && cur.UID && nama && /^hari libur nasional/i.test(desc)) {
          out.push({
            uid: cur.UID,
            tanggal: `${date[1]}-${date[2]}-${date[3]}`,
            nama,
            tentative: /belum pasti|tentatif/i.test(`${nama} ${desc}`),
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(";")[0].toUpperCase();
    cur[key] = unescapeText(line.slice(idx + 1));
  }
  return out.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

export type SyncResult =
  | { ok: true; added: number; updated: number; removed: number; skipped: number; years: number[] }
  | { ok: false; error: string };

/**
 * Upsert feed holidays for `years` and drop auto rows the feed no longer has
 * (a moved tentative date). Manual rows are never modified; a feed day that
 * already has a manual national holiday is skipped to avoid duplicates.
 * `db` must be able to write `holidays` (service role, or an HR admin session).
 */
export async function syncNationalHolidays(
  db: SupabaseClient,
  opts: { years: number[]; fetchImpl?: typeof fetch; now?: Date },
): Promise<SyncResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const years = [...new Set(opts.years)].sort();
  let ics: string;
  try {
    const res = await doFetch(NATIONAL_HOLIDAY_FEED_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ics = await res.text();
  } catch (err) {
    console.error("syncNationalHolidays: fetch failed", err);
    return { ok: false, error: "Gagal mengambil kalender libur nasional." };
  }

  const all = parseHolidayFeed(ics);
  const inYears = all.filter((h) => years.includes(Number(h.tanggal.slice(0, 4))));
  // Guard against a truncated/empty feed wiping the year's auto holidays.
  if (inYears.length === 0) {
    return { ok: false, error: "Kalender libur nasional kosong untuk tahun yang diminta." };
  }

  const from = `${years[0]}-01-01`;
  const to = `${years[years.length - 1]}-12-31`;
  const { data: existing, error: exErr } = await db
    .from("holidays")
    .select("id, tanggal, nama, sumber, external_uid")
    .is("branch_id", null)
    .gte("tanggal", from)
    .lte("tanggal", to);
  if (exErr) {
    console.error("syncNationalHolidays: load failed", exErr);
    return { ok: false, error: "Gagal memuat hari libur yang ada." };
  }
  const rows = (existing ?? []) as {
    id: string;
    tanggal: string;
    nama: string;
    sumber: string;
    external_uid: string | null;
  }[];

  const manualDates = new Set(rows.filter((r) => r.sumber !== "otomatis").map((r) => r.tanggal));
  const autoByUid = new Map(rows.filter((r) => r.external_uid).map((r) => [r.external_uid!, r]));

  const keep = inYears.filter((h) => !manualDates.has(h.tanggal));
  const skipped = inYears.length - keep.length;
  const stamp = (opts.now ?? new Date()).toISOString();

  let added = 0;
  let updated = 0;
  for (const h of keep) {
    const prev = autoByUid.get(h.uid);
    if (!prev) added += 1;
    else if (prev.tanggal !== h.tanggal || prev.nama !== h.nama) updated += 1;
  }

  if (keep.length) {
    const { error } = await db.from("holidays").upsert(
      keep.map((h) => ({
        external_uid: h.uid,
        tanggal: h.tanggal,
        nama: h.nama,
        branch_id: null,
        sumber: "otomatis",
        disinkron_at: stamp,
      })),
      { onConflict: "external_uid" },
    );
    if (error) {
      console.error("syncNationalHolidays: upsert failed", error);
      return { ok: false, error: "Gagal menyimpan hari libur nasional." };
    }
  }

  // Only years the feed actually covers are authoritative — if next year isn't
  // published yet, its existing auto rows are left alone.
  const feedYears = new Set(inYears.map((h) => h.tanggal.slice(0, 4)));
  const keepUids = new Set(keep.map((h) => h.uid));
  const stale = rows.filter(
    (r) =>
      r.sumber === "otomatis" &&
      feedYears.has(r.tanggal.slice(0, 4)) &&
      (!r.external_uid || !keepUids.has(r.external_uid)),
  );
  if (stale.length) {
    const { error } = await db.from("holidays").delete().in("id", stale.map((r) => r.id));
    if (error) {
      console.error("syncNationalHolidays: stale delete failed", error);
      return { ok: false, error: "Gagal menghapus libur yang sudah tidak berlaku." };
    }
  }

  return { ok: true, added, updated, removed: stale.length, skipped, years };
}

/** Current Jakarta year plus the next one — the window payroll and leave care about. */
export function defaultSyncYears(now = new Date()): number[] {
  const y = Number(new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "Asia/Jakarta" }).format(now));
  return [y, y + 1];
}
