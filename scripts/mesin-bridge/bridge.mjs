#!/usr/bin/env node
/**
 * Jembatan mesin absensi kantor → aplikasi absensi.
 *
 * Mode "push" (bawaan, untuk Fingerspot Revo W-231N):
 *   Mesin dalam Mode "Internet" mengirim setiap scan ke Server IP / Server Port
 *   yang diatur di mesin, lewat HTTP biasa (request_code: realtime_glog). Program
 *   ini menjadi server itu: menerima scan, menyimpannya di antrian.json, membalas
 *   OK ke mesin, lalu meneruskannya ke aplikasi di /api/mesin/scans.
 *
 *     Mesin ──HTTP (LAN/Wi-Fi)──► bridge.mjs (laptop/PC kantor) ──HTTPS + token──► aplikasi
 *
 *   Mesin menyimpan scan yang belum terkirim dan mengirim ulang saat program ini
 *   aktif lagi, jadi laptop tidak harus menyala terus.
 *
 * Mode "easylink" (opsional, PC Windows dengan Fingerspot EasyLink SDK):
 *   menarik scan dari SDK tiap INTERVAL_DETIK.
 *
 * Tanpa dependency: cukup Node.js 18 ke atas. Konfigurasi di `bridge.env`.
 *
 *   node bridge.mjs            jalan terus (mode sesuai MODE di bridge.env)
 *   node bridge.mjs --kirim    kirim isi antrian ke aplikasi sekali lalu keluar
 *   node bridge.mjs --sekali   (easylink) tarik sekali lalu keluar
 *   node bridge.mjs --semua    (easylink) kirim ulang seluruh log di mesin
 *
 * Perintah dari aplikasi (tombol "Tarik data pegawai dari mesin"): program ini
 * menanyakan /api/mesin/perintah, menyerahkannya ke mesin sebagai balasan
 * receive_cmd, lalu meneruskan hasilnya (send_cmd_result) ke aplikasi.
 *
 * Data sidik jari (realtime_enroll_data) yang ikut dikirim mesin TIDAK pernah
 * disimpan atau diteruskan — hanya PIN + nama pengguna baru yang diteruskan.
 */
import net from "node:net";
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- konfigurasi ---------------------------------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvFile(join(HERE, "bridge.env"));

const cfg = {
  mode: (process.env.MODE ?? "push").toLowerCase(),
  appUrl: (process.env.APP_URL ?? "").replace(/\/+$/, ""),
  token: process.env.MESIN_ABSENSI_TOKEN ?? "",
  // push
  port: Number(process.env.PUSH_PORT ?? 8014),
  // "No Mesin" di menu Jaringan mesin (dev_id). Kosong = terima dari mesin mana pun.
  mesinId: (process.env.MESIN_ID ?? "").trim(),
  kirimDetik: Math.max(5, Number(process.env.KIRIM_DETIK ?? 15)),
  // Bentuk badan perintah ke mesin: "fk" = 4 byte panjang (LE) + JSON + NUL,
  // seperti yang dikirim mesin; "json" = JSON polos (varian R6).
  cmdFormat: (process.env.CMD_FORMAT ?? "fk").toLowerCase(),
  // easylink
  sdkUrl: (process.env.EASYLINK_URL ?? "http://127.0.0.1:7005").replace(/\/+$/, ""),
  sn: process.env.MESIN_SN ?? "",
  intervalDetik: Math.max(15, Number(process.env.INTERVAL_DETIK ?? 60)),
  pathBaru: process.env.EASYLINK_PATH_BARU ?? "/scanlog/new",
  pathSemua: process.env.EASYLINK_PATH_SEMUA ?? "/scanlog/all/paging",
};

const args = new Set(process.argv.slice(2));
const QUEUE = join(HERE, "antrian.json");
const BATCH = 1000;
// Balasan GET_LOG_DATA (seluruh log mesin) bisa beberapa MB.
const MAX_BODY = 32 * 1024 * 1024;

function log(...a) {
  const t = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
  console.log(`[${t}]`, ...a);
}

const appConfigured = () => /^https?:\/\//.test(cfg.appUrl) && cfg.token.length >= 24;

// ---- antrian lokal (sumber kebenaran: memori, selalu disalin ke disk) -----
let queue = (() => {
  try {
    return JSON.parse(readFileSync(QUEUE, "utf8"));
  } catch {
    return [];
  }
})();
function saveQueue() {
  const tmp = `${QUEUE}.tmp`;
  writeFileSync(tmp, JSON.stringify(queue));
  renameSync(tmp, QUEUE); // atomik: antrian tidak pernah setengah tertulis
}
function enqueue(scans) {
  const seen = new Set(queue.map((s) => `${s.pin}|${s.waktu}`));
  const fresh = scans.filter((s) => !seen.has(`${s.pin}|${s.waktu}`));
  if (fresh.length) {
    queue = queue.concat(fresh);
    saveQueue();
  }
  return fresh.length;
}

// ---- kirim ke aplikasi ---------------------------------------------------
let sending = false;
async function flush() {
  if (sending || queue.length === 0 || !appConfigured()) return;
  sending = true;
  try {
    while (queue.length) {
      const batch = queue.slice(0, BATCH);
      const res = await fetch(`${cfg.appUrl}/api/mesin/scans`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ sn: cfg.mesinId || cfg.sn || null, scans: batch }),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error("Token ditolak server (cek MESIN_ABSENSI_TOKEN).");
      if (!res.ok || !body.ok) throw new Error(`Server menjawab HTTP ${res.status}: ${body.error ?? ""}`);
      queue = queue.slice(batch.length); // scan baru ditambahkan di belakang, aman
      saveQueue();
      log(`Terkirim ${batch.length} scan: ${body.scanBaru} baru, ${body.hariDitulis} hari absensi diperbarui.`);
      if (body.pinBelumTerdaftar?.length) {
        log(`PIN belum dipasangkan di aplikasi: ${body.pinBelumTerdaftar.join(", ")} (Pengaturan → Mesin absensi).`);
      }
    }
  } catch (e) {
    log("Gagal mengirim ke aplikasi:", e.message, `— ${queue.length} scan tetap di antrian, dicoba lagi nanti.`);
  } finally {
    sending = false;
  }
}

// ---- mode push: server untuk mesin ---------------------------------------
/** "20261112080655" -> "2026-11-12 08:06:55" (jam dinding mesin, WIB). */
function ioTime(t) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(t ?? ""));
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : null;
}

function parseRequest(buf) {
  const end = buf.indexOf("\r\n\r\n");
  if (end < 0) return null;
  const lines = buf.subarray(0, end).toString("latin1").split("\r\n");
  const headers = {};
  for (const l of lines.slice(1)) {
    const i = l.indexOf(":");
    if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  const len = Number(headers["content-length"] ?? 0);
  const body = buf.subarray(end + 4);
  if (body.length < len) return null;
  // Body mesin: 4 byte panjang JSON (little-endian), JSON, lalu blok biner (sidik jari).
  let json = null;
  let bins = [];
  if (body.length >= 4) {
    const jl = body.readUInt32LE(0);
    bins = splitBins(body.subarray(4 + jl, len));
    try {
      json = JSON.parse(body.subarray(4, 4 + jl).toString("utf8").replace(/\0+$/, ""));
    } catch {
      json = null;
    }
  }
  return { headers, json, bins };
}

/** Blok biner setelah JSON ("BIN_1", "BIN_2", …): masing-masing 4 byte panjang (LE) + isi. */
function splitBins(rest) {
  const out = [];
  let o = 0;
  while (o + 4 <= rest.length) {
    const n = rest.readUInt32LE(o);
    if (n === 0 || o + 4 + n > rest.length) break;
    out.push(rest.subarray(o + 4, o + 4 + n));
    o += 4 + n;
  }
  // Tanpa awalan panjang: seluruh sisa dianggap satu blok.
  if (out.length === 0 && rest.length) out.push(rest);
  return out;
}

/** Teks dari potongan byte: ASCII/UTF-8 sampai NUL, atau UTF-16LE bila byte kedua NUL. */
function binText(b) {
  if (b.length >= 2 && b[1] === 0 && b[0] !== 0) {
    let end = 0;
    while (end + 1 < b.length && (b[end] || b[end + 1])) end += 2;
    return b.subarray(0, end).toString("utf16le").trim();
  }
  const nul = b.indexOf(0);
  return b.subarray(0, nul < 0 ? b.length : nul).toString("utf8").trim();
}

/**
 * Mengganti rujukan "BIN_n" di balasan perintah dengan isinya — HANYA untuk
 * daftar PIN dan nama. Blok lain (templat sidik jari, foto) diganti ukurannya
 * saja dan tidak pernah diteruskan.
 */
function expandBins(json, bins) {
  if (!json || typeof json !== "object" || !bins.length) return json;
  const blockOf = (v) => {
    const m = typeof v === "string" ? /^BIN_(\d+)$/.exec(v) : null;
    return m ? bins[Number(m[1]) - 1] ?? null : null;
  };
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      const blk = blockOf(v);
      if (!blk) {
        out[k] = walk(v);
      } else if (/log/i.test(k)) {
        out[k] = decodeLogBlock(node, blk);
      } else if (/^user_?id_?(array|list)$/i.test(k)) {
        const size = Number(node.one_user_id_size) || 0;
        const count = Number(node.user_id_count) || (size ? Math.floor(blk.length / size) : 0);
        const ids = [];
        for (let i = 0; size && i < count && (i + 1) * size <= blk.length; i++) {
          const rec = blk.subarray(i * size, (i + 1) * size);
          const id = binText(rec);
          if (i < 2) log(`Rekaman PIN #${i + 1} (${size} byte): ${rec.toString("hex")} → "${id}"`);
          if (id) ids.push({ user_id: id });
        }
        out[k] = ids;
      } else if (/name|nama/i.test(k)) {
        out[k] = binText(blk);
      } else {
        out[k] = { bin_bytes: blk.length }; // isi tidak diteruskan
      }
    }
    return out;
  };
  return walk(json);
}

/** "20261112080655" / "2026-11-12 08:06:55" → "2026-11-12 08:06:55" (WIB), atau null. */
function wallTime(v) {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})[ T]?(\d{2}):?(\d{2}):?(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

/**
 * Satu rekaman log biner → { user_id, io_time }. Tata letaknya belum
 * terdokumentasi, jadi dicari: PIN = teks di awal rekaman; waktu = 14 digit
 * ASCII ("20261112080655") atau tahun 2 byte LE + bulan/tgl/jam/mnt/dtk.
 */
function decodeLogRecord(rec) {
  const user_id = binText(rec);
  const ascii = rec.toString("latin1");
  const m = /20\d{12}/.exec(ascii);
  if (m && wallTime(m[0])) return { user_id, io_time: m[0] };
  for (let o = 0; o + 7 <= rec.length; o++) {
    const y = rec.readUInt16LE(o);
    const [mo, d, h, mi, se] = [rec[o + 2], rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6]];
    if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59 && se <= 59) {
      const p = (n) => String(n).padStart(2, "0");
      return { user_id, io_time: `${y}${p(mo)}${p(d)}${p(h)}${p(mi)}${p(se)}` };
    }
  }
  return { user_id, io_time: null };
}

function decodeLogBlock(node, blk) {
  const sizeKey = Object.keys(node).find((k) => /^one_.*size$/i.test(k));
  const countKey = Object.keys(node).find((k) => /log.*count|count.*log/i.test(k));
  const size = Number(node[sizeKey]) || 0;
  if (!size) {
    // Mungkin JSON di dalam blok.
    try {
      return JSON.parse(binText(blk));
    } catch {
      log(`Blok log ${blk.length} byte tanpa ukuran rekaman; 64 byte awal: ${blk.subarray(0, 64).toString("hex")}`);
      return [];
    }
  }
  const count = Math.min(Number(node[countKey]) || Math.floor(blk.length / size), Math.floor(blk.length / size));
  const out = [];
  for (let i = 0; i < count; i++) {
    const rec = blk.subarray(i * size, (i + 1) * size);
    const r = decodeLogRecord(rec);
    if (i < 3) log(`Rekaman log #${i + 1} (${size} byte): ${rec.toString("hex")} → PIN "${r.user_id}" waktu ${r.io_time ?? "?"}`);
    out.push(r);
  }
  return out;
}

/** Semua scan di balasan log: objek ber-PIN dan ber-waktu, di mana pun letaknya. */
function extractLogScans(json) {
  const out = [];
  const walk = (n, depth) => {
    if (depth > 6 || !n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, depth + 1));
    const pinRaw = n.user_id ?? n.userId ?? n.pin;
    const waktu = wallTime(n.io_time ?? n.ioTime ?? n.time ?? n.log_time ?? n.datetime);
    const pin = String(pinRaw ?? "").trim().replace(/^0+(?=\d)/, "");
    if (waktu && /^[0-9A-Za-z]{1,20}$/.test(pin)) out.push({ pin, waktu });
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v, depth + 1);
  };
  walk(json, 0);
  return out;
}

/** Ringkasan kecil untuk aplikasi (scan-nya sendiri lewat antrian → /api/mesin/scans). */
function logSummary(json, scans) {
  const times = scans.map((s) => s.waktu).sort();
  const top = {};
  for (const [k, v] of Object.entries(json ?? {})) if (v === null || typeof v !== "object") top[k] = v;
  return { jumlah_log: scans.length, dari: times[0] ?? null, sampai: times[times.length - 1] ?? null, balasan: top };
}

function reply(socket, transId, ok) {
  socket.end(
    `HTTP/1.0 200 OK\r\nresponse_code: ${ok ? "OK" : "ERROR"}\r\ntrans_id: ${transId ?? ""}\r\n` +
      "Content-Type: application/octet-stream\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
  );
}

// ---- perintah dari aplikasi ke mesin ------------------------------------
let command = null; // { id, cmd_code, params, sentAt }
let fetchingCmd = false;
const CMD_RESEND_MS = 150_000;

async function fetchCommand() {
  if (fetchingCmd || command || !appConfigured()) return;
  fetchingCmd = true;
  try {
    const res = await fetch(`${cfg.appUrl}/api/mesin/perintah`, {
      headers: { authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok && body.perintah) {
      command = { ...body.perintah, sentAt: 0 };
      log(`Perintah dari aplikasi: ${command.cmd_code} ${JSON.stringify(command.params)} — diserahkan saat mesin bertanya.`);
    } else if (res.status === 404) {
      // Aplikasi versi lama tanpa saluran perintah: diam saja.
    } else if (!res.ok) {
      log(`Gagal menanyakan perintah: HTTP ${res.status} ${body.error ?? ""}`);
    }
  } catch (e) {
    log("Gagal menanyakan perintah:", e.message);
  } finally {
    fetchingCmd = false;
  }
}

async function postToApp(payload) {
  const res = await fetch(`${cfg.appUrl}/api/mesin/perintah`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ sn: cfg.mesinId || null, ...payload }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`HTTP ${res.status} ${body.error ?? ""}`);
  return body;
}

function replyCommand(socket, cmd) {
  const json = Buffer.from(JSON.stringify(cmd.params ?? {}), "utf8");
  let body;
  if (cfg.cmdFormat === "json") body = json;
  else {
    const withNul = Buffer.concat([json, Buffer.from([0])]);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(withNul.length, 0);
    body = Buffer.concat([len, withNul]);
  }
  socket.end(
    Buffer.concat([
      Buffer.from(
        `HTTP/1.0 200 OK\r\nresponse_code: OK\r\ntrans_id: ${cmd.id}\r\ncmd_code: ${cmd.cmd_code}\r\n` +
          `Content-Type: application/octet-stream\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
        "latin1",
      ),
      body,
    ]),
  );
}

/** Hanya PIN + nama dari data pendaftaran — templat sidik jari tidak pernah ikut. */
function enrollIdentity(json) {
  if (!json || typeof json !== "object") return null;
  const pick = (keys) => keys.map((k) => json[k]).find((v) => typeof v === "string" || typeof v === "number");
  const pin = pick(["user_id", "userId", "pin"]);
  if (pin == null) return null;
  const nama = pick(["user_name", "userName", "name"]);
  return { user_id: String(pin), user_name: nama == null ? null : String(nama) };
}

function startPush() {
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    let handled = false;
    socket.setTimeout(30_000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      if (handled) return;
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > MAX_BODY) return socket.destroy();
      const req = parseRequest(buf);
      if (!req) return;
      handled = true;
      const { headers, json, bins } = req;
      const code = headers["request_code"];
      const transId = headers["trans_id"];
      if (cfg.mesinId && headers["dev_id"] !== cfg.mesinId) {
        log(`Kiriman dari mesin lain (${headers["dev_id"] ?? "?"}) diabaikan.`);
        return reply(socket, transId, false);
      }
      if (code === "realtime_glog") {
        const waktu = ioTime(json?.io_time);
        const pin = String(json?.user_id ?? "").trim().replace(/^0+(?=\d)/, "");
        if (!waktu || !/^[0-9A-Za-z]{1,20}$/.test(pin)) {
          log("Log scan tidak valid diabaikan:", JSON.stringify(json)?.slice(0, 200));
          return reply(socket, transId, true); // jangan buat mesin mengulang data rusak selamanya
        }
        try {
          // Simpan ke disk DULU, baru balas OK: setelah OK mesin menganggapnya terkirim.
          if (enqueue([{ pin, waktu }])) log(`Scan PIN ${pin} ${waktu}`);
          reply(socket, transId, true);
          setTimeout(flush, 1000);
        } catch (e) {
          log("Gagal menyimpan antrian:", e.message);
          reply(socket, transId, false); // mesin akan mengirim ulang
        }
        return;
      }
      if (code === "receive_cmd") {
        if (command && command.sentAt && Date.now() - command.sentAt > CMD_RESEND_MS) {
          log(`Mesin belum membalas ${command.cmd_code}; dikirim ulang.`);
          command.sentAt = 0;
        }
        if (command && !command.sentAt) {
          command.sentAt = Date.now();
          log(`Menyerahkan ${command.cmd_code} ke mesin.`);
          return replyCommand(socket, command);
        }
        reply(socket, transId, true);
        fetchCommand();
        return;
      }
      if (code === "send_cmd_result") {
        const kode = headers["cmd_return_code"] ?? null;
        reply(socket, transId, true);
        let hasil = expandBins(json, bins);
        // Balasan mentah dicatat agar bentuk data firmware ini bisa diperiksa.
        log(`Balasan mesin (trans_id ${transId}, cmd_return_code ${kode ?? "-"}):`, JSON.stringify(hasil)?.slice(0, 1500) ?? "(kosong)");
        const mine = command && command.id === transId;
        const cmdCode = mine ? command.cmd_code : null;
        if (mine) command = null;
        if (cmdCode === "GET_LOG_DATA" || (cmdCode === null && /log/i.test(Object.keys(json ?? {}).join(",")))) {
          // Log absen: lewat antrian scan biasa (disimpan dulu, dikirim bertahap, aman diulang).
          const scans = extractLogScans(hasil);
          const baru = scans.length ? enqueue(scans) : 0;
          log(`Log absen dari mesin: ${scans.length} scan (${baru} belum ada di antrian).`);
          hasil = logSummary(json, scans);
          setTimeout(flush, 500);
        }
        if (!appConfigured() || !/^[0-9a-f-]{36}$/i.test(transId ?? "")) return;
        postToApp({ id: transId, kodeBalasan: kode, hasil })
          .then((b) => log(`Balasan diteruskan ke aplikasi${b.pengguna ? `: ${b.pengguna} pengguna terbaca` : ""}.`))
          .catch((e) => log("Gagal meneruskan balasan mesin:", e.message))
          .finally(() => fetchCommand());
        return;
      }
      if (code === "realtime_enroll_data") {
        reply(socket, transId, true);
        const who = enrollIdentity(json);
        if (who && appConfigured()) {
          postToApp({ pengguna: who })
            .then(() => log(`Pengguna mesin ${who.user_id}${who.user_name ? ` (${who.user_name})` : ""} diteruskan ke aplikasi.`))
            .catch((e) => log("Gagal meneruskan pengguna baru:", e.message));
        }
        return;
      }
      // Lainnya: cukup OK, tanpa perintah.
      reply(socket, transId, true);
    });
  });
  server.on("error", (e) => {
    console.error(`Tidak bisa membuka port ${cfg.port}: ${e.message}`);
    process.exit(2);
  });
  server.listen(cfg.port, "0.0.0.0", () => {
    log(`Menunggu kiriman mesin di port ${cfg.port}${cfg.mesinId ? ` (mesin ${cfg.mesinId})` : ""}. Antrian: ${queue.length} scan.`);
    if (!appConfigured()) {
      log("APP_URL / MESIN_ABSENSI_TOKEN belum diisi: scan hanya disimpan di antrian.json, belum dikirim ke aplikasi.");
    }
  });
  setInterval(flush, cfg.kirimDetik * 1000);
  setInterval(fetchCommand, cfg.kirimDetik * 1000);
  flush();
  fetchCommand();
}

// ---- mode easylink: tarik dari Fingerspot EasyLink SDK -------------------
async function sdk(path, params) {
  const res = await fetch(cfg.sdkUrl + path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`EasyLink SDK ${path} → HTTP ${res.status}`);
  const json = await res.json();
  if (json.Result === false) throw new Error(`EasyLink SDK ${path} menolak: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

function toScan(row) {
  const pin = String(row.PIN ?? row.pin ?? "").trim();
  const waktu = String(row.ScanDate ?? row.scan_date ?? "").trim().replace("T", " ").slice(0, 19);
  return pin && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(waktu) ? { pin, waktu } : null;
}

async function pullEasylink(all) {
  try {
    let fresh = [];
    if (all) {
      for (let page = 0; page < 1000; page++) {
        const json = await sdk(cfg.pathSemua, { sn: cfg.sn, limit: "100" });
        fresh.push(...(json.Data ?? []).map(toScan).filter(Boolean));
        if (!json.IsSession) break;
      }
    } else {
      fresh = ((await sdk(cfg.pathBaru, { sn: cfg.sn })).Data ?? []).map(toScan).filter(Boolean);
    }
    // Simpan ke antrian DULU: SDK menandai scan sebagai "sudah diambil".
    if (enqueue(fresh)) log(`${fresh.length} scan dibaca dari mesin ${cfg.sn}.`);
  } catch (e) {
    log("Gagal membaca mesin:", e.message, "— cek EasyLink SDK berjalan & mesin terhubung.");
  }
  await flush();
}

// ---- main ----------------------------------------------------------------
if (args.has("--kirim")) {
  if (!appConfigured()) {
    console.error("Isi APP_URL dan MESIN_ABSENSI_TOKEN (min. 24 karakter) di bridge.env dulu.");
    process.exit(2);
  }
  await flush();
} else if (cfg.mode === "easylink") {
  if (!cfg.sn || !appConfigured()) {
    console.error("Mode easylink butuh APP_URL, MESIN_ABSENSI_TOKEN dan MESIN_SN di bridge.env.");
    process.exit(2);
  }
  if (args.has("--semua") || args.has("--sekali")) {
    await pullEasylink(args.has("--semua"));
  } else {
    log(`Jembatan EasyLink aktif: mesin ${cfg.sn} via ${cfg.sdkUrl} → ${cfg.appUrl}, tiap ${cfg.intervalDetik} detik.`);
    for (;;) {
      await pullEasylink(false);
      await new Promise((r) => setTimeout(r, cfg.intervalDetik * 1000));
    }
  }
} else {
  startPush();
}
