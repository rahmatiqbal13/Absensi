import { describe, it, expect } from "vitest";
import { getRecentActivity } from "./recent-activity";

function db(rows: unknown[] | null, error: unknown = null) {
  const q = {
    then(resolve: (v: { data: unknown; error: unknown }) => void) {
      resolve({ data: rows, error });
    },
    order() { return q; },
    limit() { return q; },
  };
  return { from: () => ({ select: () => q }) } as never;
}

describe("getRecentActivity", () => {
  it("maps rows to { id, aksi, actorNama, waktu }", async () => {
    const res = await getRecentActivity(
      db([
        { id: "1", aksi: "update_employee", waktu: "2026-08-31T10:00:00Z", actor: { nama: "Rahmat" } },
        { id: "2", aksi: "approve_leave", waktu: "2026-08-30T09:00:00Z", actor: null },
      ]),
    );
    expect(res).toEqual({
      ok: true,
      rows: [
        { id: "1", aksi: "update_employee", actorNama: "Rahmat", waktu: "2026-08-31T10:00:00Z" },
        { id: "2", aksi: "approve_leave", actorNama: "Sistem", waktu: "2026-08-30T09:00:00Z" },
      ],
    });
  });

  it("returns an error result on a query error", async () => {
    const res = await getRecentActivity(db(null, { message: "x" }));
    expect(res.ok).toBe(false);
  });
});
