import { describe, it, expect } from "vitest";
import { decodeMachineFile, parseMachineLog } from "./parse-log";

// Synthetic log in the Fingerspot Revo USB format (not real employee data).
const PLAIN = [
  "UDISKLOG\tversion=4\tdate=2026-09-08\tfirmware=A107A2S6Kbc01 v1.24",
  "No\tMchn\tEnNo\t\tName\t\t\tMode\tIOMd\tDateTime",
  "000001\t1\t8\tbudi            \t268435456\t001\t2026/08/01  07:07:48",
  "000002\t1\t00012\tSiti Aminah     \t268435456\t001\t2026/08/01  17:37:33",
  "rusak",
  "",
].join("\r\n");

const xor = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0) ^ 0xd7));

describe("decodeMachineFile", () => {
  it("undoes the machine's XOR 0xD7 obfuscation", () => {
    expect(decodeMachineFile(xor(PLAIN))).toBe(PLAIN);
  });
  it("leaves an already-decoded file alone", () => {
    expect(decodeMachineFile(new TextEncoder().encode(PLAIN))).toBe(PLAIN);
  });
});

describe("parseMachineLog", () => {
  it("reads PIN, name and WIB time to the second", () => {
    const r = parseMachineLog(decodeMachineFile(xor(PLAIN)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toBe(1);
    expect(r.header).toMatch(/^UDISKLOG/);
    expect(r.scans).toEqual([
      { pin: "8", namaMesin: "budi", tanggal: "2026-08-01", waktu: "2026-08-01T00:07:48.000Z", mesin: "1" },
      // Zero-padded EnNo is normalised so it matches the PIN HR typed.
      { pin: "12", namaMesin: "Siti Aminah", tanggal: "2026-08-01", waktu: "2026-08-01T10:37:33.000Z", mesin: "1" },
    ]);
  });

  it("rejects files that are not a machine log", () => {
    const r = parseMachineLog("nama,email\nbudi,b@x.id");
    expect(r.ok).toBe(false);
  });
});
