import { describe, it, expect, vi } from "vitest";

const sendPush = vi.fn(async () => ({ sent: 0, failed: 0 }));
vi.mock("./push", () => ({ sendPush: (...a: unknown[]) => sendPush(...(a as [])) }));

import { createNotifications, type NewNotification } from "./create";

const row = (employee_id: string): NewNotification => ({
  employee_id, jenis: "lupa_absen", kunci: "2026-11-18", judul: "Anda belum absen", isi: "Jadwal 08:00", link: "/absen",
});

describe("createNotifications", () => {
  it("pushes only the rows this call inserted (duplicates skipped)", async () => {
    const inserted = [{ ...row("e1"), id: "n1" }]; // e2 already had today's reminder
    const db = { from: () => ({ upsert: () => ({ select: async () => ({ data: inserted, error: null }) }) }) } as never;
    expect(await createNotifications(db, [row("e1"), row("e2")])).toEqual({ ok: true, created: 1 });
    expect(sendPush).toHaveBeenCalledWith(db, [
      { employeeId: "e1", title: "Anda belum absen", body: "Jadwal 08:00", link: "/absen", tag: "lupa_absen:2026-11-18" },
    ]);
  });
});
