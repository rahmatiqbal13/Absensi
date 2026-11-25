import { describe, it, expect } from "vitest";
import { bridgeHealth, parseBridgeReport, type BridgeStatusRow } from "./bridge-status";

const NOW = new Date("2026-11-25T02:10:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const row = (p: Partial<BridgeStatusRow>): BridgeStatusRow => ({
  bridge_at: ago(0.5), mesin_at: ago(0.2), bridge_ip: "10.216.225.69", port: 8014, mesin_ip: "10.216.230.5", ...p,
});

describe("bridgeHealth", () => {
  it("unknown without a report (bridge not updated or migration 0066 missing)", () => {
    expect(bridgeHealth(null, NOW)).toEqual({ state: "tidak_diketahui" });
  });

  it("connected when both the bridge and the machine are recent", () => {
    expect(bridgeHealth(row({}), NOW)).toMatchObject({ state: "terhubung", ip: "10.216.225.69", port: 8014 });
  });

  it("bridge down when it stopped reporting, whatever the machine did", () => {
    expect(bridgeHealth(row({ bridge_at: ago(5) }), NOW)).toEqual({ state: "bridge_mati", sejak: ago(5) });
  });

  it("machine disconnected when the bridge is alive but has not heard from it", () => {
    expect(bridgeHealth(row({ mesin_at: ago(30) }), NOW)).toMatchObject({ state: "mesin_putus", sejak: ago(30), ip: "10.216.225.69" });
    expect(bridgeHealth(row({ mesin_at: null }), NOW)).toMatchObject({ state: "mesin_putus", sejak: null });
  });
});

describe("parseBridgeReport", () => {
  it("keeps valid fields and stamps the server time", () => {
    expect(parseBridgeReport({ mesinAt: ago(1), ip: "10.216.225.69", port: 8014, mesinIp: "10.216.230.5" }, "SN1", NOW)).toEqual({
      id: "utama", bridge_at: NOW.toISOString(), mesin_at: ago(1), bridge_ip: "10.216.225.69", port: 8014, mesin_ip: "10.216.230.5", sn: "SN1",
    });
  });

  it("drops junk and a machine time from the future", () => {
    expect(parseBridgeReport({ mesinAt: "2099-01-01T00:00:00Z", ip: "<script>", port: 99999, mesinIp: 5 }, null, NOW)).toMatchObject({
      mesin_at: null, bridge_ip: null, port: null, mesin_ip: null,
    });
  });
});
