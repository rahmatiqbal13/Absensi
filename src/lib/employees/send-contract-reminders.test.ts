import { describe, it, expect, vi } from "vitest";
import { sendContractReminders } from "./send-contract-reminders";

const NOW = new Date("2026-11-18T07:00:00+07:00");

function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

function makeDb(contracts: unknown[]) {
  const upsert = vi.fn((rows: unknown[]) => q({ data: rows.map((_, i) => ({ id: `n${i}` })), error: null }));
  const db = {
    from: (t: string) => {
      if (t === "employees")
        return q({
          data: [
            { id: "hr1", nama: "HR Satu", slug: "hr-satu", role: "hr_admin" },
            { id: "sa1", nama: "Super", slug: "super", role: "super_admin" },
            { id: "e1", nama: "Budi", slug: "budi", role: "karyawan" },
            { id: "m1", nama: "Sari", slug: "sari", role: "karyawan" },
          ],
          error: null,
        });
      if (t === "employee_contracts") return q({ data: contracts, error: null });
      return { upsert };
    },
  };
  return { db: db as never, upsert };
}

describe("sendContractReminders", () => {
  it("notifies every HR admin and super admin, once per contract stage", async () => {
    const { db, upsert } = makeDb([
      // Budi: old contract plus a newer one ending in 13 days -> H30.
      { id: "old", employee_id: "e1", jenis: "pkwt", tanggal_mulai: "2025-01-01", tanggal_selesai: "2025-12-31", catatan: null },
      { id: "cur", employee_id: "e1", jenis: "pkwt", tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-12-01", catatan: null },
      // Sari: internship ended yesterday.
      { id: "mg", employee_id: "m1", jenis: "magang", tanggal_mulai: "2026-08-01", tanggal_selesai: "2026-11-17", catatan: null },
    ]);
    const res = await sendContractReminders(db, NOW);
    expect(res).toEqual({ ok: true, due: 2, created: 4 });
    const [rows, opts] = upsert.mock.calls[0] as unknown as [Record<string, string>[], unknown];
    expect(opts).toEqual({ onConflict: "employee_id,jenis,kunci", ignoreDuplicates: true });
    expect(rows.map((r) => `${r.employee_id}|${r.kunci}`).sort()).toEqual(
      ["hr1|cur:H30", "hr1|mg:berakhir", "sa1|cur:H30", "sa1|mg:berakhir"].sort(),
    );
    const budi = rows.find((r) => r.kunci === "cur:H30")!;
    expect(budi).toMatchObject({ jenis: "kontrak", judul: "Kontrak Budi berakhir dalam 13 hari", link: "/karyawan/budi" });
    expect(rows.find((r) => r.kunci === "mg:berakhir")!.judul).toBe("Masa magang Sari sudah berakhir");
  });

  it("stays quiet for permanent and far-off contracts", async () => {
    const { db, upsert } = makeDb([
      { id: "t", employee_id: "e1", jenis: "pkwtt", tanggal_mulai: "2020-01-01", tanggal_selesai: null, catatan: null },
      { id: "f", employee_id: "m1", jenis: "pkwt", tanggal_mulai: "2026-01-01", tanggal_selesai: "2027-06-30", catatan: null },
    ]);
    expect(await sendContractReminders(db, NOW)).toEqual({ ok: true, due: 0, created: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });
});
