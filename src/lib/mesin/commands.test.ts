import { describe, expect, it } from "vitest";
import { monthWindows, recordCommandResult } from "./commands";

type Call = { table: string; op: string; payload?: unknown; filters: unknown[][] };

/** Chainable stand-in for the Supabase builder; `cmd` is what maybeSingle() returns. */
function fakeDb(cmd: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    for (const f of ["select", "eq", "in", "is", "gt", "lt", "or", "order", "limit"]) {
      b[f] = (...a: unknown[]) => {
        if (f !== "select") call.filters.push([f, ...a]);
        return b;
      };
    }
    for (const op of ["insert", "update", "upsert"]) {
      b[op] = (payload: unknown) => {
        call.op = op;
        call.payload = payload;
        return b;
      };
    }
    b.maybeSingle = async () => ({ data: cmd, error: null });
    b.then = (res: (v: unknown) => void) => res({ data: null, error: null });
    return b;
  };
  return { db: { from } as never, calls };
}

const ROOT = { id: "r1", cmd_code: "GET_USER_ID_LIST", params: {}, status: "diambil", induk_id: null, diminta_oleh: "hr" };

describe("recordCommandResult", () => {
  it("stores the id list and asks for each nameless user", async () => {
    const { db, calls } = fakeDb(ROOT);
    const r = await recordCommandResult(db, { id: "r1", kodeBalasan: "OK", hasil: { user_id_array: [{ user_id: "8" }, { user_id: "12" }] }, sn: "SN" });
    expect(r).toEqual({ ok: true, pengguna: 2 });
    expect(calls.find((c) => c.op === "update")?.payload).toMatchObject({ status: "selesai", kode_balasan: "OK" });
    const follow = calls.find((c) => c.table === "mesin_commands" && c.op === "insert")?.payload as { params: unknown; induk_id: string }[];
    expect(follow.map((f) => f.params)).toEqual([{ user_id: "8" }, { user_id: "12" }]);
    expect(follow.every((f) => f.induk_id === "r1")).toBe(true);
  });

  it("asks nothing more when the list already has names", async () => {
    const { db, calls } = fakeDb(ROOT);
    await recordCommandResult(db, { id: "r1", kodeBalasan: "OK", hasil: { users: [{ userId: "8", name: "Budi" }] }, sn: null });
    expect(calls.some((c) => c.table === "mesin_commands" && c.op === "insert")).toBe(false);
    expect(calls.find((c) => c.table === "mesin_users" && c.op === "upsert")?.payload).toMatchObject([{ pin: "8", nama: "Budi" }]);
  });

  it("marks a rejected command failed", async () => {
    const { db, calls } = fakeDb(ROOT);
    const r = await recordCommandResult(db, { id: "r1", kodeBalasan: "NOT SUPPORT CMD", hasil: null, sn: null });
    expect(r).toEqual({ ok: true, pengguna: 0 });
    expect(calls.find((c) => c.op === "update")?.payload).toMatchObject({ status: "gagal", kode_balasan: "NOT SUPPORT CMD" });
  });

  it("retries a rejected { user_id } GET_USER_INFO in the R6 shape", async () => {
    const { db, calls } = fakeDb({ ...ROOT, id: "c1", cmd_code: "GET_USER_INFO", params: { user_id: "8" }, induk_id: "r1" });
    await recordCommandResult(db, { id: "c1", kodeBalasan: "ERROR_INVALID_PARAMTER", hasil: null, sn: null });
    expect(calls.find((c) => c.op === "insert")?.payload).toMatchObject({ cmd_code: "GET_USER_INFO", params: { usersId: ["8"] }, induk_id: "r1" });
  });

  it("skips the remaining per-PIN questions when one reply lists everyone", async () => {
    const { db, calls } = fakeDb({ ...ROOT, id: "c1", cmd_code: "GET_USER_INFO", params: { usersId: ["8"] }, induk_id: "r1" });
    await recordCommandResult(db, {
      id: "c1",
      kodeBalasan: "OK",
      hasil: { users: [{ userId: "8", name: "Budi" }, { userId: "12", name: "Siti" }] },
      sn: null,
    });
    const skip = calls.filter((c) => c.op === "update")[1];
    expect(skip.payload).toMatchObject({ status: "selesai", kode_balasan: "DILEWATI" });
    expect(skip.filters).toContainEqual(["eq", "status", "menunggu"]);
  });

  it("404s an unknown command", async () => {
    const { db } = fakeDb(null);
    expect(await recordCommandResult(db, { id: "x", kodeBalasan: "OK", hasil: {}, sn: null })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("monthWindows", () => {
  it("splits a range into calendar months, clipped at both ends", () => {
    expect(monthWindows("2026-01-15", "2026-03-10")).toEqual([
      { begin_time: "20260115000000", end_time: "20260131235959" },
      { begin_time: "20260201000000", end_time: "20260228235959" },
      { begin_time: "20260301000000", end_time: "20260310235959" },
    ]);
  });
  it("crosses a year boundary", () => {
    expect(monthWindows("2025-12-01", "2026-01-31").map((w) => w.begin_time)).toEqual(["20251201000000", "20260101000000"]);
  });
});

describe("recordCommandResult GET_LOG_DATA", () => {
  const LOG = { ...ROOT, cmd_code: "GET_LOG_DATA", params: { begin_time: "20260101000000", end_time: "20260131235959" } };

  it("records a month in range without touching the other months", async () => {
    const { db, calls } = fakeDb(LOG);
    await recordCommandResult(db, { id: "r1", kodeBalasan: "OK", hasil: { jumlah_log: 40, dari: "2026-01-02 07:01:00", sampai: "2026-01-30 16:10:00" }, sn: null });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(1);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("skips the remaining months when the machine ignored the range", async () => {
    const { db, calls } = fakeDb(LOG);
    await recordCommandResult(db, { id: "r1", kodeBalasan: "OK", hasil: { jumlah_log: 900, dari: "2025-03-01 07:00:00", sampai: "2026-11-20 16:00:00" }, sn: null });
    expect(calls.filter((c) => c.op === "update")[1].payload).toMatchObject({ kode_balasan: "DILEWATI" });
  });

  it("falls back to the whole log when a range is rejected", async () => {
    const { db, calls } = fakeDb(LOG);
    await recordCommandResult(db, { id: "r1", kodeBalasan: "ERROR_INVALID_PARAMETER", hasil: null, sn: null });
    expect(calls.find((c) => c.op === "insert")?.payload).toMatchObject({ cmd_code: "GET_LOG_DATA", params: {}, induk_id: "r1" });
  });
});
