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
 * Data sidik jari (realtime_enroll_data) yang ikut dikirim mesin TIDAK pernah
 * disimpan atau diteruskan — hanya dibalas OK.
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
const MAX_BODY = 256 * 1024;

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
  if (body.length >= 4) {
    const jl = body.readUInt32LE(0);
    try {
      json = JSON.parse(body.subarray(4, 4 + jl).toString("utf8").replace(/\0+$/, ""));
    } catch {
      json = null;
    }
  }
  return { headers, json };
}

function reply(socket, transId, ok) {
  socket.end(
    `HTTP/1.0 200 OK\r\nresponse_code: ${ok ? "OK" : "ERROR"}\r\ntrans_id: ${transId ?? ""}\r\n` +
      "Content-Type: application/octet-stream\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
  );
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
      const { headers, json } = req;
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
      // receive_cmd (mesin menanyakan perintah), realtime_enroll_data (data sidik
      // jari — sengaja tidak disimpan), dan lainnya: cukup OK, tanpa perintah.
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
  flush();
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
