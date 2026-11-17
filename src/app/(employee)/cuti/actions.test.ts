import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ rpc })),
  createServiceRoleSupabaseClient: vi.fn(() => ({})),
}));
const getCurrentEmployee = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: (...a: unknown[]) => getCurrentEmployee(...a) }));
vi.mock("@/lib/leave/notify", () => ({ notifyApproverOfLeave: vi.fn() }));

import { revalidatePath } from "next/cache";
import { cancelLeave } from "./actions";

beforeEach(() => {
  rpc.mockReset();
  getCurrentEmployee.mockReset();
  getCurrentEmployee.mockResolvedValue({ id: "e1", role: "karyawan" });
  vi.mocked(revalidatePath).mockClear();
});

describe("cancelLeave", () => {
  it("calls the RPC with the request id and revalidates /cuti", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    expect(await cancelLeave("r1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("cancel_leave_request", { p_request_id: "r1" });
    expect(revalidatePath).toHaveBeenCalledWith("/cuti");
  });

  it("refuses when not signed in, without calling the RPC", async () => {
    getCurrentEmployee.mockResolvedValue(null);
    const r = await cancelLeave("r1");
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps 'already started' to a friendly message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "leave has already started" } });
    expect(await cancelLeave("r1")).toEqual({
      ok: false,
      error: "Cuti yang sudah berjalan tidak bisa dibatalkan. Hubungi HR.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("collapses an unknown DB error to a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });
    expect(await cancelLeave("r1")).toEqual({ ok: false, error: "Gagal membatalkan pengajuan cuti." });
  });
});
