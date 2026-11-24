# Jembatan mesin absensi (Fingerspot Revo W-231N)

Memasukkan scan dari mesin fingerprint ke aplikasi secara otomatis lewat jaringan
kantor. Aplikasi berjalan di internet dan mesin hanya bisa mengirim HTTP biasa ke
sebuah IP di jaringannya, jadi sebuah laptop/PC di kantor menjadi perantaranya.

```
Mesin (Wi-Fi kantor) ──HTTP──► bridge.mjs (laptop/PC kantor) ──HTTPS + token──► aplikasi /api/mesin/scans
```

- Tidak perlu Windows, SDK, atau langganan Fingerspot — cukup Node.js 18+ (macOS/Windows/Linux).
- Laptop **tidak harus menyala terus**: mesin menyimpan scan yang belum terkirim dan
  mengirim ulang semuanya begitu bridge aktif lagi.
- Data sidik jari yang ikut dikirim mesin tidak pernah disimpan atau diteruskan.

Cara tanpa jaringan tetap tersedia: **Pengaturan → Mesin absensi → Impor file**
(file `AGL001.TXT` dari flashdisk).

## Pemasangan (mode push — bawaan)

1. **Server** — buat token acak (`openssl rand -hex 32`), isi `MESIN_ABSENSI_TOKEN` di
   environment variables server (Vercel), deploy ulang. Jalankan migrasi
   `0061_machine_attendance.sql`.
2. **PIN pegawai** — di *Pengaturan → Mesin absensi*, isi PIN tiap pegawai sesuai ID di mesin.
3. **Laptop/PC kantor** — salin folder ini, buat `bridge.env` dari `bridge.env.example`:
   `MODE=push`, `APP_URL`, `MESIN_ABSENSI_TOKEN`, `PUSH_PORT=8014`,
   `MESIN_ID` = "No Mesin" di menu Jaringan mesin.
4. **IP laptop harus tetap** — minta admin jaringan membuat *DHCP reservation* untuk
   MAC Wi-Fi laptop (macOS: System Settings → Wi-Fi → Details → alamat MAC Wi-Fi —
   matikan "Private Wi-Fi address" untuk jaringan kantor). Tanpa ini IP laptop berganti
   tiap hari dan mesin mengirim ke alamat yang salah.
5. **Mesin** — Menu → Komunikasi → Jaringan:
   - Mode: **Internet**
   - Server IP: **IP laptop/PC** (macOS: `ipconfig getifaddr en0`)
   - Server Port: **8014** (sama dengan `PUSH_PORT`)
   - Server Req: **Ya**
6. **Jalankan** di folder ini: `node bridge.mjs`. Saat mesin mengirim, muncul
   `Scan PIN … ` lalu `Terkirim … scan`.
   - macOS: izinkan **Local Network** untuk Terminal / VS Code dan koneksi masuk untuk `node`
     (System Settings → Privacy & Security → Local Network; Network → Firewall).
7. **Otomatis saat login (macOS)** — buat LaunchAgent, atau cukup jalankan `node bridge.mjs`
   di Terminal setiap tiba di kantor.

Bila `APP_URL` / token belum diisi, scan tetap diterima dan disimpan di `antrian.json`;
jalankan `node bridge.mjs --kirim` setelah diisi untuk mengirim semuanya.

## Mode easylink (opsional, PC Windows)

Untuk mesin yang dibaca lewat Fingerspot EasyLink SDK: `MODE=easylink`, isi `MESIN_SN`
dan `EASYLINK_URL`, lalu `node bridge.mjs` (atau `--sekali` / `--semua`). Nama endpoint
SDK bisa disesuaikan dengan `EASYLINK_PATH_BARU` / `EASYLINK_PATH_SEMUA`.

## Catatan

- Aman diulang: scan yang sudah pernah diterima diabaikan server.
- Bila internet / server putus, scan menunggu di `antrian.json` dan dikirim ulang otomatis.
- Jam masuk = scan pertama, jam pulang = scan terakhir di hari itu (WIB). Absen lewat aplikasi
  (GPS/QR) di hari yang sama digabung; absen yang dikoreksi HR tidak pernah ditimpa.
- Hari di bulan yang payroll-nya sudah **final** tidak diubah.
- Mengembalikan mesin ke cloud Fingerspot: Server IP `3.1.174.198`, Server Port `8014`.
