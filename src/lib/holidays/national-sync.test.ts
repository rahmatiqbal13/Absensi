import { describe, it, expect } from "vitest";
import { parseHolidayFeed, syncNationalHolidays, defaultSyncYears } from "./national-sync";

const ev = (uid: string, date: string, summary: string, desc: string) =>
  ["BEGIN:VEVENT", `DTSTART;VALUE=DATE:${date}`, `UID:${uid}`, `SUMMARY:${summary}`, `DESCRIPTION:${desc}`, "END:VEVENT"].join("\r\n");

const FEED = [
  "BEGIN:VCALENDAR",
  ev("a@google.com", "20260321", "Hari Idul Fitri", "Hari libur nasional"),
  ev("b@google.com", "20260320", "Cuti Bersama Idul Fitri", "Hari libur nasional"),
  ev("c@google.com", "20260219", "1 Ramadan", "Perayaan\\nUntuk menyembunyikan perayaan\\, buka Setelan"),
  // folded long line
  ["BEGIN:VEVENT", "DTSTART;VALUE=DATE:20270101", "UID:d@google.com", "SUMMARY:Hari Tahun Baru (belum pa", " sti)", "DESCRIPTION:Hari libur nasional\\nTanggal bersifat tentatif", "END:VEVENT"].join("\r\n"),
  "END:VCALENDAR",
].join("\r\n");

describe("parseHolidayFeed", () => {
  it("keeps national holidays and cuti bersama, skips observances, unfolds lines", () => {
    expect(parseHolidayFeed(FEED)).toEqual([
      { uid: "b@google.com", tanggal: "2026-03-20", nama: "Cuti Bersama Idul Fitri", tentative: false },
      { uid: "a@google.com", tanggal: "2026-03-21", nama: "Hari Idul Fitri", tentative: false },
      { uid: "d@google.com", tanggal: "2027-01-01", nama: "Hari Tahun Baru (belum pasti)", tentative: true },
    ]);
  });
});

function mockDb(existing: object[]) {
  const calls: { upsert?: object[]; deleted?: string[] } = {};
  const select = {
    is: () => select,
    gte: () => select,
    lte: () => Promise.resolve({ data: existing, error: null }),
  };
  const db = {
    from: () => ({
      select: () => select,
      upsert: (rows: object[]) => {
        calls.upsert = rows;
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        in: (_c: string, ids: string[]) => {
          calls.deleted = ids;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { db: db as never, calls };
}

const okFetch = (async () => new Response(FEED)) as typeof fetch;

describe("syncNationalHolidays", () => {
  it("upserts feed days, skips dates with a manual holiday, removes stale auto rows only", async () => {
    const { db, calls } = mockDb([
      { id: "m1", tanggal: "2026-03-21", nama: "Idul Fitri (manual)", sumber: "manual", external_uid: null },
      { id: "s1", tanggal: "2026-03-25", nama: "Old", sumber: "otomatis", external_uid: "gone@google.com" },
      { id: "k1", tanggal: "2026-03-20", nama: "Cuti Bersama Idul Fitri", sumber: "otomatis", external_uid: "b@google.com" },
    ]);
    const res = await syncNationalHolidays(db, { years: [2026], fetchImpl: okFetch });
    expect(res).toMatchObject({ ok: true, added: 0, updated: 0, removed: 1, skipped: 1 });
    expect(calls.upsert?.map((r) => (r as { external_uid: string }).external_uid)).toEqual(["b@google.com"]);
    expect(calls.deleted).toEqual(["s1"]);
  });

  it("refuses to sync when the feed has nothing for the requested years", async () => {
    const { db, calls } = mockDb([]);
    const res = await syncNationalHolidays(db, { years: [2030], fetchImpl: okFetch });
    expect(res.ok).toBe(false);
    expect(calls.upsert).toBeUndefined();
  });

  it("reports a fetch failure", async () => {
    const { db } = mockDb([]);
    const res = await syncNationalHolidays(db, {
      years: [2026],
      fetchImpl: (async () => new Response("", { status: 500 })) as typeof fetch,
    });
    expect(res.ok).toBe(false);
  });
});

describe("defaultSyncYears", () => {
  it("uses the Jakarta year", () => {
    expect(defaultSyncYears(new Date("2026-12-31T18:00:00Z"))).toEqual([2027, 2028]);
  });
});
