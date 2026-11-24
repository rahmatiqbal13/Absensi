/**
 * Reads the attendance log a Fingerspot Revo machine (e.g. W-231N) writes to a
 * USB stick ("Download GLog" → AGL001.TXT). The file is tab-separated text,
 *
 *   UDISKLOG\tversion=4\tdate=2026-09-08\tfirmware=...
 *   No\tMchn\tEnNo\t\tName\t\t\tMode\tIOMd\tDateTime
 *   000001\t1\t8\tyudi            \t268435456\t001\t2026/08/01  07:07:48
 *
 * but every byte is XOR-ed with 0xD7 on disk. Both the obfuscated file and an
 * already-decoded copy are accepted. Times are the machine's wall clock (WIB).
 */

export type MachineScan = {
  /** EnNo — the employee's PIN on the machine. */
  pin: string;
  /** Name as stored on the machine (trimmed), for matching help only. */
  namaMesin: string;
  /** "2026-08-01" (WIB). */
  tanggal: string;
  /** ISO instant, e.g. "2026-08-01T00:07:48.000Z". */
  waktu: string;
  /** Machine number (Mchn), when present. */
  mesin: string | null;
};

export type ParseResult =
  | { ok: true; scans: MachineScan[]; skipped: number; header: string | null }
  | { ok: false; error: string };

const XOR_KEY = 0xd7;
const MAGIC = "UDISKLOG";

/** Undo the machine's single-byte XOR when the file starts with the obfuscated magic. */
export function decodeMachineFile(bytes: Uint8Array): string {
  const magic = [...MAGIC].map((c) => c.charCodeAt(0) ^ XOR_KEY);
  const obfuscated = magic.every((b, i) => bytes[i] === b);
  const plain = obfuscated ? bytes.map((b) => b ^ XOR_KEY) : bytes;
  // Names are ASCII in practice; latin1 never throws on odd bytes.
  return new TextDecoder("latin1").decode(plain);
}

/** WIB wall-clock -> ISO instant (WIB is a fixed UTC+7, no DST). */
export function wibToIso(tanggal: string, jam: string): string {
  return new Date(`${tanggal}T${jam}+07:00`).toISOString();
}

// 000001  1  8  yudi  268435456  001  2026/08/01  07:07:48
const ROW_RE =
  /^\s*(\d+)\t(\d+)\t([0-9A-Za-z]{1,20})\t([^\t]*)\t(\d+)\t(\d+)\t(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*$/;

export function parseMachineLog(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const header = lines[0]?.startsWith(MAGIC) ? lines[0] : null;
  const scans: MachineScan[] = [];
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim() || line.startsWith(MAGIC) || /^No\t/i.test(line)) continue;
    const m = ROW_RE.exec(line);
    if (!m) {
      skipped += 1;
      continue;
    }
    const [, , mchn, enNo, name, , , y, mo, d, h, mi, s] = m;
    const tanggal = `${y}-${mo}-${d}`;
    const jam = `${h}:${mi}:${s}`;
    const waktu = wibToIso(tanggal, jam);
    if (Number.isNaN(Date.parse(waktu)) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) {
      skipped += 1;
      continue;
    }
    // The machine pads EnNo with zeros on some firmwares ("00008"); keep the number.
    const pin = /^\d+$/.test(enNo) ? String(Number(enNo)) : enNo;
    scans.push({ pin, namaMesin: name.trim(), tanggal, waktu, mesin: mchn });
  }
  if (scans.length === 0) {
    return {
      ok: false,
      error: header
        ? "File log mesin tidak berisi data scan."
        : "Format file tidak dikenali. Gunakan file log dari mesin (mis. AGL001.TXT dari menu USB / Download GLog).",
    };
  }
  return { ok: true, scans, skipped, header };
}
