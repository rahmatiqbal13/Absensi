# Spec: Sistem Absensi Karyawan + HR — Fase 1+2 (MVP + Cuti + Slip Gaji Sederhana)

**Status:** Disetujui untuk implementasi
**Tanggal:** 25 Agustus 2026
**Sumber:** `PRD-Sistem-Absensi-HR.md`
**Scope:** Fase 1 (auth, role, data karyawan/cabang/departemen, absensi GPS+foto, dashboard) +
Fase 2 (cuti/izin dengan approval berjenjang, saldo cuti) + tambahan gaji harian otomatis
dengan slip gaji sederhana (gaji pokok − potongan absensi, tanpa PPh21/BPJS/lembur).

## Di luar scope spec ini

Sengaja tidak dikerjakan sekarang, untuk spec/fase terpisah nanti:
- PPh21, tabel `TaxConfig`, BPJS, lembur (tunjangan_lembur) — perhitungan payroll penuh Fase 3.
- Notifikasi push, import massal Excel, jadwal shift (P1 / Fase 4).
- Integrasi fingerprint/face-recognition hardware, native mobile app, multi-bahasa (P2).

## 1. Stack & Struktur Proyek

- Next.js 15+ (App Router, TypeScript) + Supabase (Postgres + Auth + Storage + Realtime) +
  Tailwind + shadcn/ui — konsisten dengan proyek lain (CatatUang, sewa-ruang).
- Satu Next.js app, dua route group:
  - `(auth)/login` — shared login, redirect sesuai role setelah sukses.
  - `(employee)/absen`, `/cuti`, `/riwayat`, `/profil` — mobile-first, **semua role** bisa akses
    (karyawan berrole admin tetap absen di sini, sesuai PRD §4 — tidak ada jalur pintas).
  - `(admin)/dashboard`, `/karyawan`, `/cuti`, `/laporan`, `/pengaturan`, `/payroll` — desktop,
    hanya role `atasan`/`hr_admin`/`super_admin` (middleware cek role dari session, redirect
    role `karyawan` yang mencoba akses).
- Semua write divalidasi di server action/API route, tidak hanya di client.
- Deployment: Vercel + Supabase project terpisah dev/prod.

## 2. Data Model (Postgres via Supabase)

```sql
branches            id, nama, alamat, lat, long, radius_geofencing_meter (default 100)
departments          id, branch_id, nama
employees            id (= auth.users.id), nama, email, no_telp, foto_profil_url,
                      branch_id, department_id, atasan_id (self-ref, nullable),
                      jabatan, status_kontrak, tanggal_mulai_kerja, gaji_pokok,
                      role (karyawan|atasan|hr_admin|super_admin),
                      designated_approver_id (wajib diisi utk role hr_admin/super_admin),
                      status (aktif|nonaktif)

work_schedules        id, branch_id, jam_masuk, jam_pulang, hari_kerja[] (array hari),
                      toleransi_terlambat_menit
holidays              id, tanggal, nama, berlaku_untuk (nasional | branch_id)

attendances           id, employee_id, tanggal,
                      jam_masuk, lokasi_masuk (point), foto_masuk_url, foto_masuk_expires_at,
                      jam_pulang, lokasi_pulang (point), foto_pulang_url, foto_pulang_expires_at,
                      status (tepat_waktu|terlambat|pulang_cepat|alpa|di_luar_lokasi),
                      catatan
                      -- constraint unique (employee_id, tanggal)

leave_requests         id, employee_id, jenis, tanggal_mulai, tanggal_selesai,
                      alasan, lampiran_url,
                      status (pending|approved|rejected),
                      approver_id, catatan_approval,
                      is_self_request (bool)

leave_balances         id, employee_id, tahun, saldo_awal, saldo_terpakai, saldo_sisa

consents               id, employee_id, jenis (lokasi_foto_absensi), disetujui_at, versi_kebijakan

payroll_periods         id, branch_id (nullable = company-wide), bulan, tahun, status (draft|final)
payslips                id, employee_id, payroll_period_id,
                      gaji_pokok, hari_kerja_efektif, gaji_harian,
                      total_potongan_absensi, gaji_akhir,
                      rincian_harian (jsonb — breakdown per tanggal untuk transparansi/audit)

audit_logs              id, actor_id, target_employee_id, aksi, waktu, detail (jsonb),
                      is_self_action (bool)
```

Catatan:
- `employees.id = auth.users.id` — satu baris per orang, role adalah atribut (PRD §4).
- Foto disimpan di Supabase Storage bucket **privat**, diakses lewat signed URL, bukan public.
  `*_expires_at` = upload time + 90 hari (kebijakan retensi v1 — lihat §6).
- RLS jadi lapisan pertama (karyawan hanya row miliknya; atasan hanya row `atasan_id = auth.uid()`;
  hr_admin/super_admin semua). Logika approval & self-approval **tetap divalidasi ulang di server
  action**, karena RLS berbasis ownership tidak cukup untuk aturan bisnis approval-chain.

## 3. Auth & RBAC

- Supabase Auth (email/password), **invite-only**: HR admin/Super admin membuat akun karyawan
  lewat `(admin)/karyawan/baru`, sistem kirim link set-password (Supabase built-in). Tidak ada
  halaman signup publik.
- Role dibaca dari `employees.role` via session di middleware & server components.
- Middleware memblokir `(admin)/*` untuk role `karyawan`; `(employee)/*` selalu terbuka untuk
  semua role yang sudah login.

## 4. Alur Absensi (Clock In/Out)

1. **Deteksi mobile-only di server**: kombinasi `User-Agent` header + sinyal client
   (`navigator.maxTouchPoints`, viewport). Best-effort (bukan jaminan kriptografis) — tujuannya
   menaikkan effort dari "override GPS lewat DevTools desktop" ke "harus spoof UA + touch
   capability", sesuai tujuan anti-kecurangan PRD §6, bukan mencegah 100%. Jika terdeteksi
   desktop: tombol clock-in/out disembunyikan + pesan jelas; fitur self-service lain tetap normal.
2. Consent check: sebelum absen pertama kali, employee wajib centang persetujuan pemrosesan
   data lokasi/foto (dicatat ke `consents`); belum consent → redirect ke halaman consent dulu.
3. Klik clock-in → browser minta Geolocation + buka kamera (`<input capture="user">`) untuk selfie.
4. Server action: hitung jarak Haversine antara koordinat submit vs `branches.lat/long`.
   Di luar `radius_geofencing_meter` → status `di_luar_lokasi`, wajib isi catatan/alasan.
   `di_luar_lokasi` **tidak otomatis dianggap pelanggaran** — jadi konteks review atasan
   (PRD §6, risiko tim lapangan).
5. Cegah double clock-in: constraint unique `(employee_id, tanggal)` + validasi server sebelum insert.
6. Status tepat_waktu/terlambat/pulang_cepat dihitung dari `work_schedules` cabang + toleransi menit.
7. Foto upload ke Storage privat, hanya URL disimpan di `attendances`.

## 5. Alur Cuti/Izin

1. Karyawan ajukan: jenis (sesuai tabel kebijakan §6 PRD), tanggal, alasan, lampiran.
2. `approver_id` = `atasan_id` karyawan. **Kecuali** karyawan itu `hr_admin`/`super_admin` atau
   `atasan_id` kosong/mengarah ke diri sendiri → pakai `designated_approver_id`,
   `is_self_request = true`.
3. Validasi saldo di server: jenis yang memotong saldo (cuti tahunan) ditolak jika durasi >
   `leave_balances.saldo_sisa`. Sakit/izin lain tanpa potongan saldo dilewati dari cek ini.
4. Notifikasi email ke approver saat pengajuan baru (Resend/SMTP).
5. **Cek server-side wajib saat approve/reject**: `approver_id (tersimpan) === auth.uid()` DAN
   `approver_id !== employee_id pemohon` — kalau match dengan pemohon sendiri, ditolak otomatis
   di server (bukan hanya disembunyikan di UI).
6. Reject wajib disertai `catatan_approval`.
7. Approve → `leave_balances.saldo_terpakai` bertambah dalam transaksi atomik bersama update
   status (hindari race condition).
8. Semua approve/reject dicatat ke `audit_logs`, dengan flag `is_self_action` bila relevan.
9. Minimal harus ada **2 Super Admin** di sistem agar bisa saling jadi `designated_approver`;
   jika cuma 1, tampilkan warning di halaman pengaturan.

## 6. Dashboard & Laporan HR

- `(admin)/dashboard`: ringkasan hadir/terlambat/absen per hari per cabang, via Supabase
  Realtime subscription ke `attendances` (update otomatis, delay minimal).
- Filter cabang/departemen/rentang tanggal, tunduk RLS (atasan hanya lihat timnya).
- Grafik tren bulanan (Recharts).
- Export Excel (`xlsx`) dan PDF (`@react-pdf/renderer`) untuk rekap kehadiran & slip gaji.

## 7. Gaji Harian Otomatis & Slip Gaji Sederhana

Tanpa PPh21/BPJS/lembur — hanya gaji pokok dikurangi potongan absensi.

```
hari_kerja_efektif_bulan = hari di work_schedules.hari_kerja[] cabang dalam bulan tsb,
                            dikurangi holidays yang berlaku

gaji_harian = gaji_pokok ÷ hari_kerja_efektif_bulan   -- dihitung ulang tiap periode

Per hari attendance:
  alpa            → potongan = gaji_harian (1 hari penuh)
  terlambat       → potongan = gaji_harian × (menit_terlambat ÷ total_menit_kerja_harian)
  pulang_cepat    → potongan = gaji_harian × (menit_pulang_cepat ÷ total_menit_kerja_harian)
  tepat_waktu     → potongan = 0
  di_luar_lokasi  → potongan = 0 (baru berubah kalau atasan reklasifikasi manual)

gaji_akhir = gaji_pokok − Σ potongan_absensi (satu bulan)
```

`work_schedules.jam_masuk`/`jam_pulang` dipakai untuk hitung `total_menit_kerja_harian`.

**Alur:** HR admin klik "Generate Payroll" untuk periode → sistem hitung `gaji_akhir` semua
karyawan dari data `attendances` bulan itu → status `draft` (bisa regenerate ulang jika ada
koreksi absensi). HR admin klik "Finalisasi" → status `final`, terkunci, siap ekspor sebagai
slip gaji.

## 8. Non-Functional

**Audit log:** semua write ke `employees` (mutasi data), `attendances` (koreksi manual admin),
`leave_requests` (approve/reject) dicatat otomatis (trigger Postgres atau wrapper server action)
— `actor_id`, `target_employee_id`, `aksi`, `detail` (jsonb before/after), `is_self_action`.

**UI/UX (PRD §7.1):** satu design token set untuk dua layout berbeda. Aksen 1 warna
vibrant/saturasi tinggi + netral kontras tinggi (bukan pastel, dipakai outdoor siang hari).
Status absensi selalu ikon + label + warna (aksesibilitas buta warna merah-hijau). Mobile:
bottom nav (Absen/Cuti/Riwayat/Profil), target sentuh min 44×44px, font min 16px. Admin: sidebar,
tabel sortable/filterable, grafik ringkasan di atas — densitas lebih tinggi, tidak reuse layout
mobile.

**Retensi data (UU PDP, PRD §10):** foto absensi disimpan 90 hari lalu ditandai kadaluarsa
(`expires_at`); v1 belum ada cron auto-delete fisik, hanya penandaan. Consent wajib dicentang
saat onboarding/absen pertama.

**Testing:**
- Unit test: Haversine/geofencing, status terlambat/tepat waktu, resolusi `approver_id`
  (termasuk kasus self-approval harus ditolak), perhitungan gaji harian & potongan proporsional.
- Integration test server actions kritis: clock-in (duplicate prevention, mobile-lock, radius),
  leave approval (self-approval block, saldo check, atomic balance update), generate payroll.
- Manual QA checklist mengikuti acceptance criteria per fitur di PRD §6.

## 9. Open Items (dibawa dari PRD, belum perlu diputuskan sebelum mulai implementasi)

- Validasi hasil perhitungan gaji oleh staf HR/akuntan secara manual sebelum dipakai pembayaran
  riil (paralel run beberapa periode pertama) — proses operasional, di luar kode.
- Konfirmasi kebijakan retensi foto & consent ke penasihat hukum internal sebelum go-live —
  bukan blocker untuk mulai development.
