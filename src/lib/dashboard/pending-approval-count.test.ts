import { describe, it, expect } from "vitest";
import { getPendingApprovalCount } from "./pending-approval-count";

// Minimal chainable count-query mock: .from().select(_, {count, head}).eq().eq()
// then awaited. Records the .eq() calls so we can assert the role scoping.
function makeCountDb(count: number | null, error: unknown = null) {
  const eqCalls: [string, string][] = [];
  const thenable = {
    eqCalls,
    then(resolve: (v: { count: number | null; error: unknown }) => void) {
      resolve({ count, error });
    },
    eq(col: string, val: string) {
      eqCalls.push([col, val]);
      return thenable;
    },
  };
  return {
    eqCalls,
    from: () => ({ select: () => thenable }),
  } as never;
}

describe("getPendingApprovalCount", () => {
  it("counts all pending requests for an hr_admin (no approver filter)", async () => {
    const c = makeCountDb(4);
    const res = await getPendingApprovalCount(c, { id: "u1", role: "hr_admin" });
    expect(res).toEqual({ ok: true, count: 4 });
    expect((c as unknown as { eqCalls: [string, string][] }).eqCalls).toEqual([["status", "pending"]]);
  });

  it("filters by approver_id for a non-admin", async () => {
    const c = makeCountDb(2);
    const res = await getPendingApprovalCount(c, { id: "u9", role: "atasan" });
    expect(res).toEqual({ ok: true, count: 2 });
    expect((c as unknown as { eqCalls: [string, string][] }).eqCalls).toEqual([
      ["status", "pending"],
      ["approver_id", "u9"],
    ]);
  });

  it("returns an error result on a query error", async () => {
    const c = makeCountDb(null, { message: "boom" });
    const res = await getPendingApprovalCount(c, { id: "u1", role: "super_admin" });
    expect(res.ok).toBe(false);
  });
});
