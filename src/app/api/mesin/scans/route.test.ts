import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleSupabaseClient: () => ({ service: true }) }));
const applyMachineScans = vi.fn();
vi.mock("@/lib/mesin/apply-scans", () => ({
  applyMachineScans: (...a: unknown[]) => applyMachineScans(...a),
}));

import { POST } from "./route";

const TOKEN = "t".repeat(32);
const req = (body: unknown, auth?: string) =>
  new NextRequest("https://tapabsen.vercel.app/api/mesin/scans", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  applyMachineScans.mockReset();
  applyMachineScans.mockResolvedValue({ ok: true, days: [], unmapped: [{ pin: "99", namaMesin: "", jumlahScan: 1 }], scanBaru: 1, ditulis: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/mesin/scans", () => {
  it("rejects a missing, wrong, or too-short token", async () => {
    vi.stubEnv("MESIN_ABSENSI_TOKEN", TOKEN);
    expect((await POST(req({ scans: [] }))).status).toBe(401);
    expect((await POST(req({ scans: [] }, "Bearer nope"))).status).toBe(401);
    vi.stubEnv("MESIN_ABSENSI_TOKEN", "short");
    expect((await POST(req({ scans: [] }, "Bearer short"))).status).toBe(401);
    expect(applyMachineScans).not.toHaveBeenCalled();
  });

  it("converts WIB machine time and reports invalid rows", async () => {
    vi.stubEnv("MESIN_ABSENSI_TOKEN", TOKEN);
    const res = await POST(
      req(
        {
          sn: "SN123",
          scans: [
            { pin: "008", waktu: "2026-08-01 07:07:48" },
            { pin: "x y", waktu: "2026-08-01 07:07:48" },
            { pin: "9", waktu: "kemarin" },
          ],
        },
        `Bearer ${TOKEN}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, diterima: 1, tidakValid: [1, 2], pinBelumTerdaftar: ["99"] });
    expect(applyMachineScans).toHaveBeenCalledWith(
      { service: true },
      [{ pin: "8", waktu: "2026-08-01T00:07:48.000Z", sn: "SN123" }],
      { sumber: "jaringan", actorId: null, dryRun: false },
    );
  });

  it("rejects a body that is not JSON / has no scans array", async () => {
    vi.stubEnv("MESIN_ABSENSI_TOKEN", TOKEN);
    expect((await POST(req("{", `Bearer ${TOKEN}`))).status).toBe(400);
    expect((await POST(req({ scans: "x" }, `Bearer ${TOKEN}`))).status).toBe(400);
  });
});
