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
7. **Otomatis saat login (macOS)** — `bash pasang-macos.sh` memasang LaunchAgent: jembatan
   jalan sendiri setiap login dan hidup lagi bila berhenti. `bash pasang-macos.sh status`
   untuk melihat log, `bash pasang-macos.sh lepas` untuk mencopot.

Bila `APP_URL` / token belum diisi, scan tetap diterima dan disimpan di `antrian.json`;
jalankan `node bridge.mjs --kirim` setelah diisi untuk mengirim semuanya.

## Tarik data pegawai dari mesin

*Pengaturan → Mesin absensi → "Tarik data pegawai dari mesin"* meminta daftar pengguna
(PIN + nama) dari mesin lewat jembatan ini: aplikasi menaruh perintah, jembatan
mengambilnya dan menyerahkannya ke mesin saat mesin menanyakan perintah (`receive_cmd`),
lalu balasan mesin (`send_cmd_result`) diteruskan ke aplikasi. Hasilnya tampil sebagai
tabel PIN / nama di mesin dengan tombol **Pasangkan** ke pegawai.

- Butuh migrasi `0062_mesin_commands.sql` dan jembatan versi ini (jalankan ulang setelah
  memperbarui: `bash pasang-macos.sh` atau hentikan lalu `node bridge.mjs`).
- Urutan: `GET_USER_ID_LIST`, lalu `GET_USER_INFO` per PIN bila daftar tidak membawa nama.
  Butuh beberapa detik per pegawai (mengikuti seberapa sering mesin bertanya).
- Setiap balasan mesin dicatat mentah di log jembatan (`Balasan mesin …`) — bila tabel
  tetap kosong, kirimkan baris itu untuk menyesuaikan dengan firmware mesin. Bila mesin
  tidak pernah membalas, coba `CMD_FORMAT=json` di `bridge.env`.
- Pegawai yang baru didaftarkan di mesin (`realtime_enroll_data`) juga ikut masuk ke
  tabel — hanya PIN + nama, templat sidik jari tidak pernah diteruskan.

## Tarik semua absen dari mesin

*Pengaturan → Mesin absensi → "Tarik semua absen dari mesin"* mengambil seluruh log absen
yang tersimpan di mesin untuk rentang tanggal yang dipilih (bawaan: awal tahun s.d. hari ini).

- Aplikasi memecahnya per bulan (`GET_LOG_DATA` dengan `begin_time` / `end_time`); jembatan
  menyerahkannya ke mesin satu per satu (± 20 detik per bulan).
- Scan masuk lewat antrian biasa (`antrian.json` → `/api/mesin/scans`), jadi aturannya sama:
  yang sudah ada diabaikan, koreksi HR tidak ditimpa, bulan payroll final tidak diubah.
  Aman diulang kapan saja.
- Mesin yang mengabaikan rentang tanggal mengirim seluruh log sekaligus — bulan sisanya
  otomatis dilewati. Mesin yang menolak rentang tanggal diminta seluruh log sekali.
- Tiga rekaman pertama tiap balasan dicatat di log (`Rekaman log #…`) beserta hasil
  bacaannya. Bila jumlah scan 0 atau PIN / waktunya salah, kirimkan baris itu untuk
  menyesuaikan pembacanya dengan firmware mesin.

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
