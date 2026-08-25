# PRD & Rencana Teknis: Sistem Absensi Karyawan + HR

**Status:** Draft perencanaan (belum eksekusi)
**Tanggal:** 25 Agustus 2026
**Skala target:** Perusahaan menengah, multi-cabang/departemen

---

## 1. Problem Statement

Perusahaan dengan banyak cabang/departemen biasanya masih mengelola absensi dan data karyawan secara manual (Excel, kertas, atau aplikasi absensi terpisah dari sistem HR). Ini menyebabkan data kehadiran, cuti, dan payroll tidak sinkron, rawan manipulasi (titip absen), dan menyulitkan HR pusat untuk memantau kehadiran lintas cabang secara real-time. Tanpa sistem terpadu, proses rekap gaji dan laporan kehadiran bulanan memakan waktu berhari-hari dan rentan salah.

## 2. Goals

1. Karyawan bisa clock in/out dari HP dengan validasi lokasi (GPS) dan/atau foto selfie, mengurangi kecurangan absensi.
2. Approval cuti/izin selesai maksimal 1x24 jam kerja lewat alur digital (bukan kertas/WA).
3. HR pusat punya satu dashboard untuk memantau kehadiran semua cabang/departemen secara real-time.
4. Rekap kehadiran → data payroll dasar tersedia otomatis, memangkas waktu rekap manual dari berhari-hari jadi hitungan menit.
5. Setiap cabang/departemen punya struktur approval sendiri (atasan langsung) tanpa harus semua persetujuan lewat HR pusat.

## 3. Non-Goals (v1)

- **Potongan BPJS Kesehatan & Ketenagakerjaan otomatis:** *(diputuskan bersama stakeholder)* v1 menghitung gaji sampai net setelah PPh21, tapi **belum** memotong BPJS secara otomatis — field ini disiapkan di skema data agar mudah diaktifkan di fase berikutnya, tapi perhitungannya belum jalan di v1.
- **Integrasi ke software payroll/akuntansi eksternal:** belum ada sistem existing yang perlu diintegrasikan (dikonfirmasi stakeholder) — output rekap tetap tersedia dalam format ekspor (Excel/PDF slip gaji) untuk dipakai manual bila suatu saat dibutuhkan.
- **Integrasi mesin fingerprint/face-recognition fisik:** v1 fokus pada absensi via aplikasi mobile/web (GPS + foto). Integrasi hardware absensi bisa jadi fase berikutnya.
- **Multi-currency / multi-negara:** asumsi operasional dalam satu negara (Indonesia) dengan satu mata uang di v1.
- **Recruitment & performance management:** modul HR lain (rekrutmen, penilaian kinerja) di luar cakupan v1 — fokus hanya absensi, cuti, data karyawan dasar, dan laporan.
- **Native mobile app (iOS/Android store):** v1 menggunakan web app responsif (PWA) agar bisa dipakai di HP tanpa proses rilis ke app store; native app bisa jadi fase berikutnya.

## 4. User Roles / Persona

| Role | Deskripsi |
|---|---|
| **Karyawan** | Absen masuk/pulang, ajukan cuti/izin, lihat riwayat kehadiran & slip data pribadi |
| **Atasan/Manajer Cabang** | Approve/reject cuti-izin timnya, lihat kehadiran tim, kelola jadwal cabang |
| **HR Admin (pusat)** | Kelola data karyawan semua cabang, atur kebijakan cuti/jam kerja, lihat laporan lintas cabang, kelola payroll dasar |
| **Super Admin** | Kelola user, role, konfigurasi sistem (cabang, departemen, hari libur) |

> **Catatan penting — role bukan entitas terpisah dari karyawan:** Seorang HR Admin atau Super Admin yang berstatus karyawan aktif **tetap satu baris data** di tabel `Employee` dengan atribut `role` menandakan hak aksesnya. Ia absen lewat alur yang sama persis dengan karyawan biasa (clock in/out, GPS, foto) — tidak ada jalur pintas untuk role tinggi. UI harus memisahkan jelas antara "Absensi Saya" dan "Panel Admin" agar tidak ambigu aksi mana yang dilakukan atas nama dirinya sendiri.
>
> **Aturan wajib: larangan self-approval.** Admin/atasan tidak boleh approve pengajuan cuti atau koreksi absensi miliknya sendiri, walau secara teknis punya hak akses tersebut — ini celah fraud paling umum di sistem HR. Pengajuan milik admin harus di-escalate ke approver lain (atasan levelnya, atau sesama admin/super admin yang ditunjuk). Setiap aksi seorang admin terhadap datanya sendiri wajib ditandai khusus di audit log (terpisah dari aktivitas mengelola data orang lain), untuk memudahkan investigasi bila suatu saat dicurigai.
>
> **Validasi lokasi tetap berlaku untuk admin, tanpa pengecualian default.** Radius geofencing 100m (lihat §6) berlaku sama untuk HR Admin/Super Admin seperti karyawan biasa — absensi mereka tetap divalidasi terhadap koordinat cabang tempat mereka terdaftar (mis. admin yang memang bertugas di kantor pusat divalidasi terhadap lokasi kantor pusat, sama seperti karyawan cabang lain divalidasi terhadap cabangnya masing-masing). Jangan buat pengecualian otomatis untuk role tinggi — itu insentif desain yang buruk dan jadi celah audit pertama yang dicurigai.

## 5. User Stories (prioritas tertinggi dulu)

- Sebagai **karyawan**, saya ingin absen masuk/pulang lewat HP dengan validasi lokasi agar saya tidak perlu absen manual dan atasan yakin saya benar hadir di lokasi kerja.
- Sebagai **karyawan**, saya ingin mengajukan cuti/izin lewat aplikasi dan melihat statusnya agar saya tidak perlu menunggu approval manual lewat kertas.
- Sebagai **atasan**, saya ingin menerima notifikasi pengajuan cuti timnya dan approve/reject dari HP agar proses tidak tertunda.
- Sebagai **HR admin**, saya ingin melihat dashboard kehadiran semua cabang dalam satu layar agar saya bisa cepat mendeteksi cabang dengan tingkat keterlambatan/ketidakhadiran tinggi.
- Sebagai **HR admin**, saya ingin mengelola data karyawan (kontrak, jabatan, gaji pokok, cabang) terpusat agar tidak ada data ganda antar cabang.
- Sebagai **HR admin**, saya ingin mengekspor rekap kehadiran bulanan per karyawan (hari kerja, terlambat, lembur, potongan) agar bisa langsung dipakai proses payroll.
- Sebagai **karyawan**, saya ingin melihat sisa saldo cuti saya agar saya tahu berapa hari cuti yang masih tersedia.
- Sebagai **super admin**, saya ingin mengatur hari libur nasional dan jam kerja per cabang agar perhitungan keterlambatan/lembur akurat sesuai kebijakan masing-masing cabang.

## 6. Requirements

### Must-Have (P0)

**Absensi**
- Clock in/out via web app (PWA) dengan capture lokasi GPS dan foto selfie.
- **Akses karyawan via browser (mobile maupun desktop) dibedakan per fitur:** fitur self-service (riwayat absensi, cuti, saldo cuti, slip gaji, profil) dapat diakses bebas dari browser mana pun, mobile atau desktop. **Aksi clock-in/out dikunci hanya bisa dilakukan dari konteks mobile** — karena validasi GPS jauh lebih mudah dipalsukan dari browser desktop (override koordinat lewat DevTools browser, tanpa keahlian teknis khusus) dibanding dari HP. Ini bukan pembatasan sembarangan — kalau clock-in dibuka bebas dari desktop, kontrol anti-kecurangan yang jadi tujuan utama sistem ini (Goal #1) jadi lemah.
- Validasi radius lokasi terhadap koordinat kantor/cabang: **radius geofencing 100 meter**, berlaku sama untuk semua cabang dan semua karyawan tanpa pengecualian (termasuk karyawan lapangan — *diputuskan bersama stakeholder untuk disamakan, bukan diberi jalur khusus*).
- Deteksi otomatis status: tepat waktu, terlambat, pulang cepat, alpa (tidak absen).
- Riwayat absensi per karyawan (harian/bulanan).

*Acceptance criteria:*
- [ ] Karyawan hanya bisa clock in sekali per sesi kerja (mencegah double clock-in)
- [ ] Jika lokasi di luar radius 100m dari koordinat cabang, sistem menandai absensi sebagai "di luar lokasi" dan meminta catatan/alasan
- [ ] Status keterlambatan dihitung otomatis berdasarkan jam kerja cabang terkait
- [ ] Tombol/aksi clock-in-out tidak tersedia (disembunyikan atau dinonaktifkan dengan pesan jelas) saat aplikasi dibuka dari browser desktop; fitur self-service lain tetap berfungsi normal

> **Risiko yang perlu diawasi:** menyamakan radius 100m untuk semua karyawan berarti karyawan lapangan/sales yang memang tidak selalu berada di kantor akan sering ditandai "di luar lokasi". Ini bukan bug, tapi pastikan alur "catatan/alasan" untuk kasus ini benar-benar dipakai oleh atasan sebagai konteks review, bukan otomatis dianggap pelanggaran — kalau tidak, akan banyak keluhan dari tim lapangan begitu sistem live.

**Cuti & Izin**
- Pengajuan cuti/izin dengan jenis (cuti tahunan, sakit, izin, dll), tanggal, dan lampiran (misal surat dokter).
- Alur approval berjenjang (atasan langsung → HR jika perlu), dengan larangan self-approval (lihat catatan di §4).
- Saldo cuti otomatis berkurang saat cuti disetujui.
- Notifikasi ke atasan saat ada pengajuan baru.
- Kebijakan cuti **disamakan untuk semua cabang** di v1 (belum ada kebijakan berbeda per cabang), mengikuti standar minimum UU Ketenagakerjaan Indonesia:

| Jenis Cuti/Izin | Ketentuan Default |
|---|---|
| Cuti tahunan | 12 hari kerja/tahun, berlaku setelah karyawan bekerja minimal 12 bulan berturut-turut |
| Cuti sakit | Tanpa batas hari, wajib lampiran surat dokter untuk >1 hari; tidak memotong saldo cuti tahunan |
| Cuti melahirkan | 3 bulan (1,5 bulan sebelum + 1,5 bulan sesudah perkiraan lahir) |
| Cuti keguguran | 1,5 bulan |
| Izin menikah (karyawan sendiri) | 3 hari |
| Izin menikahkan anak | 2 hari |
| Izin khitan/baptis anak | 2 hari |
| Izin istri melahirkan/keguguran (bagi karyawan pria) | 2 hari |
| Izin kematian keluarga inti (istri/suami/anak/orang tua/mertua) | 2 hari |
| Izin kematian anggota keluarga serumah lainnya | 1 hari |

*Catatan: nilai-nilai ini adalah standar minimum berdasarkan Pasal 79 & 93 UU No. 13/2003 (sebagaimana diubah UU Cipta Kerja) sebagai baseline perencanaan — bukan nasihat hukum. Sebelum go-live, tetap disarankan divalidasi oleh staf HR/legal internal, karena bisa ada kebijakan internal perusahaan yang lebih longgar dari standar minimum ini.*

*Acceptance criteria:*
- [ ] Karyawan tidak bisa mengajukan cuti melebihi saldo yang tersedia (kecuali jenis izin/sakit tanpa potongan saldo)
- [ ] Status pengajuan (pending/approved/rejected) terlihat real-time oleh karyawan
- [ ] Approval/reject wajib disertai catatan jika ditolak
- [ ] Sistem menolak submit approval jika approver = pemohon itu sendiri (cek server-side, bukan hanya UI)

**Data Karyawan & Payroll (sampai PPh21)**
- Database karyawan: data pribadi, jabatan, departemen, cabang, status kontrak, tanggal mulai kerja, gaji pokok, **status PTKP** (status pernikahan + jumlah tanggungan, untuk hitung pajak).
- Struktur organisasi (cabang → departemen → karyawan → atasan).
- Rekap kehadiran → komponen gaji: hari kerja efektif, keterlambatan, lembur, potongan absensi.
- **Perhitungan gaji bruto → PPh21 → gaji netto**, menggunakan tarif PPh21 progresif & tabel PTKP yang **dikonfigurasi di sistem (bukan hardcode)**, agar saat pemerintah mengubah tarif/ambang batas, tim tidak perlu mengubah kode — cukup update tabel tarif.
- Slip gaji digital per karyawan per periode (rincian: gaji pokok, lembur, potongan absensi, PPh21, gaji netto).
- Ekspor data rekap & slip gaji ke format Excel/PDF.

*Acceptance criteria:*
- [ ] Setiap karyawan terhubung ke satu cabang dan satu atasan langsung
- [ ] Perubahan data karyawan (mutasi cabang, kenaikan jabatan, perubahan status PTKP) tercatat dengan riwayat (audit trail)
- [ ] Perhitungan PPh21 memakai tabel tarif & PTKP yang tersimpan di database, dapat diedit HR/super admin tanpa deploy ulang aplikasi
- [ ] Slip gaji menampilkan rincian perhitungan secara transparan (bukan cuma angka akhir), agar mudah diaudit/dikoreksi
- [ ] Ekspor rekap bulanan menghasilkan file yang bisa dibuka di Excel tanpa error format

> **Risiko yang wajib diperhatikan sebelum go-live:** perhitungan PPh21 punya banyak variasi kasus riil (karyawan baru di tengah tahun, karyawan resign, bonus/THR yang kena pajak berbeda, penghasilan tidak teratur). Kalau perhitungan ini salah dan dipakai untuk pembayaran gaji riil, itu bisa jadi masalah hukum/pajak bagi perusahaan, bukan cuma bug software. Rekomendasi saya: sebelum dipakai untuk pembayaran riil, hasil perhitungan sistem divalidasi manual oleh staf pajak/akuntan selama minimal 1-2 periode gaji pertama (paralel run), baru dipercaya sepenuhnya. Jangan anggap ini "selesai" hanya karena kode sudah jalan tanpa error.

**Laporan & Dashboard HR**
- Dashboard ringkasan: total hadir/terlambat/absen per hari, per cabang.
- Filter laporan berdasarkan cabang, departemen, rentang tanggal.
- Grafik tren kehadiran bulanan.

*Acceptance criteria:*
- [ ] Dashboard menampilkan data real-time (update saat ada absensi baru, maksimal delay beberapa menit)
- [ ] HR admin bisa melihat data semua cabang; atasan cabang hanya melihat data timnya sendiri (role-based access)

**Autentikasi & Keamanan**
- Login dengan role-based access control (karyawan, atasan, HR admin, super admin).
- Data sensitif (gaji, data pribadi) hanya bisa diakses role yang berwenang.

### Nice-to-Have (P1)

- Notifikasi push/email untuk pengingat absen, approval pending, atau keterlambatan berulang.
- Import data karyawan massal via Excel.
- Jadwal shift kerja (bukan hanya jam kerja tetap).
- Slip data kehadiran otomatis dikirim ke email karyawan tiap bulan.
- Dark mode / kustomisasi tampilan sederhana.

### Future Considerations (P2)

- Potongan BPJS Kesehatan & Ketenagakerjaan otomatis (skema data sudah disiapkan agar mudah diaktifkan).
- Integrasi ke software payroll/akuntansi eksternal, jika suatu saat perusahaan mengadopsi salah satu.
- **Integrasi mesin fingerprint/face-recognition hardware** — *belum pasti, calon proyek terpisah setelah v1 stabil (dikonfirmasi stakeholder, bukan bagian scope v1 saat ini).* Catatan riset awal untuk referensi nanti: mesin yang dipertimbangkan adalah seri **Fingerspot Revo** (kemungkinan model W-230N atau W-231N — perlu dikonfirmasi ulang model persisnya saat proyek ini dimulai). Fingerspot punya API/SDK resmi (`developer.fingerspot.io`) untuk sinkronisasi data absensi ke sistem HRIS pihak ketiga, tapi ini **produk berlangganan berbayar terpisah** dari harga mesin — perlu dianggarkan sebagai biaya operasional berkelanjutan, bukan biaya development sekali bayar. Saat proyek ini benar-benar dimulai, perlu diputuskan dulu apakah data dari mesin fingerprint akan jadi sumber data absensi tambahan (mis. untuk karyawan kantor tetap) berdampingan dengan absensi mobile (untuk karyawan lapangan), disatukan lewat kolom `sumber` di tabel `Attendance`.
- Modul rekrutmen dan performance review.
- Native mobile app.
- Multi-bahasa.

## 7. Rekomendasi Arsitektur & Tech Stack (untuk eksekusi di VS Code)

Karena project ini akan dieksekusi langsung di VS Code, berikut rekomendasi stack yang praktis untuk tim kecil-menengah dan mudah di-maintain:

| Layer | Rekomendasi | Alasan |
|---|---|---|
| Frontend (web app / PWA) | React + TypeScript + Tailwind CSS | Ekosistem besar, mudah dibuat PWA agar bisa dipakai seperti app di HP |
| Backend / API | Node.js (NestJS atau Express) + TypeScript | Satu bahasa (TS) dari frontend ke backend, mempercepat development tim kecil |
| Database | PostgreSQL | Relasional, cocok untuk data terstruktur (karyawan, cabang, cuti) dan mendukung geolocation (ekstensi PostGIS bila perlu) |
| Autentikasi | JWT + refresh token, role-based access control (RBAC) | Standar, aman, mudah diintegrasikan ke frontend & mobile nanti |
| File storage (foto absensi) | Object storage (S3-compatible, misal Cloudflare R2/MinIO) | Foto tidak disimpan di server aplikasi langsung, lebih scalable |
| Deployment | Docker Compose untuk dev; VPS/cloud (mis. Railway, Render, atau VPS + Nginx) untuk production awal | Mudah direplikasi dari environment VS Code ke server |
| Notifikasi | Email (SMTP/Resend) untuk v1; push notification (web push) untuk P1 | Email cukup untuk MVP, push bisa menyusul |

**Alternatif lebih sederhana** (jika tim sangat kecil/solo dev): Next.js full-stack (App Router) + Prisma ORM + PostgreSQL — satu framework untuk frontend & API, mengurangi kompleksitas setup di awal.

### 7.1 Arah Desain UI/UX *(diputuskan bersama stakeholder)*

- **Prinsip:** Mobile-first untuk karyawan (aplikasi web/PWA dipakai di HP), web dashboard terpisah untuk admin (diakses browser desktop) — dua pengalaman berbeda, satu design system.
- **Palet warna:** Satu warna brand vibrant/saturated sebagai aksen utama (tombol interaktif, ikon status, highlight) + palet netral kontras tinggi (putih/abu-abu) untuk latar & teks — bukan pastel pucat, karena aplikasi dipakai outdoor di siang hari. Hindari lebih dari 1 warna aksen dominan per layar.
- **Status kehadiran:** warna **selalu dipasangkan dengan ikon + label teks** (bukan warna saja), karena sebagian pengguna mengalami buta warna merah-hijau — kombinasi status paling umum dipakai.
- **Mobile (karyawan):** bottom navigation bar (Absen/Cuti/Riwayat/Profil), tombol clock-in/out sebagai elemen paling dominan di layar utama dengan feedback visual jelas, font minimum 16px, target sentuh tombol minimum 44×44px.
- **Web (admin):** pola dashboard standar — sidebar navigasi, tabel data dengan sorting/filter, grafik ringkasan di atas. Densitas informasi lebih tinggi daripada versi mobile; tidak me-reuse layout mobile.
- **Konsistensi:** kedua pengalaman memakai design token (warna, tipografi, spacing) yang sama agar terasa satu produk, meski layout berbeda total.
- **Rekomendasi proses:** buat mockup visual dulu (mobile + web admin) sebelum coding komponen, dan lakukan audit aksesibilitas (kontras warna, ukuran target sentuh) terhadap mockup sebelum development — jauh lebih murah dikoreksi di tahap ini.

## 8. Struktur Data Inti (Draft Skema Database)

```
Company
 └── Branch (cabang)
      └── Department (departemen)
           └── Employee (karyawan)

Employee
 - id, nama, email, no_telp, foto_profil
 - branch_id, department_id, atasan_id (self-reference)
 - jabatan, status_kontrak, tanggal_mulai_kerja
 - gaji_pokok
 - status_ptkp (mis. TK/0, K/1, K/2, ... — untuk hitung PPh21)
 - role (karyawan/atasan/hr_admin/super_admin)

Attendance (absensi)
 - id, employee_id, tanggal
 - jam_masuk, lokasi_masuk (lat,long), foto_masuk
 - jam_pulang, lokasi_pulang (lat,long), foto_pulang
 - status (tepat_waktu/terlambat/pulang_cepat/alpa/di_luar_lokasi)
 - catatan

LeaveRequest (cuti/izin)
 - id, employee_id, jenis (tahunan/sakit/izin/lainnya)
 - tanggal_mulai, tanggal_selesai, alasan, lampiran
 - status (pending/approved/rejected), approved_by, catatan_approval
 - is_self_request (flag: true jika pemohon = approver default, wajib di-escalate)

LeaveBalance (saldo cuti)
 - id, employee_id, tahun, saldo_awal, saldo_terpakai, saldo_sisa

WorkSchedule (jam kerja per cabang)
 - id, branch_id, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit
 - radius_geofencing_meter (default 100)

Holiday (hari libur)
 - id, tanggal, nama, berlaku_untuk (nasional/cabang tertentu)

PayrollPeriod (periode gaji)
 - id, bulan, tahun, status (draft/final/dibayar)

Payslip (slip gaji per periode)
 - id, employee_id, payroll_period_id
 - gaji_pokok, tunjangan_lembur, potongan_absensi
 - gaji_bruto, pph21, gaji_netto
 - (kolom bpjs_kesehatan, bpjs_ketenagakerjaan disiapkan tapi belum dipakai di v1)

TaxConfig (tabel tarif PPh21 & PTKP — dapat diedit HR/super admin)
 - id, tahun_berlaku, jenis (tarif_progresif/ptkp), parameter (JSON: batas bawah/atas, persentase, atau nominal PTKP per status)

AuditLog (jejak audit)
 - id, actor_employee_id, target_employee_id, aksi, waktu, detail
 - is_self_action (flag: true jika actor mengedit datanya sendiri)
```

## 9. Success Metrics

**Leading (minggu-bulan pertama setelah rilis)**
- Adopsi: ≥90% karyawan aktif absen lewat aplikasi dalam 2 minggu pertama.
- Waktu approval cuti rata-rata < 24 jam kerja.
- Error rate absensi (gagal submit/lokasi tidak terdeteksi) < 5%.

**Lagging (setelah 1-3 bulan)**
- Waktu proses rekap payroll turun dari (misal) 3 hari menjadi < 1 jam kerja HR.
- Penurunan kasus "titip absen" yang terdeteksi lewat validasi lokasi/foto.
- Kepuasan HR admin & atasan terhadap kemudahan approval (survei sederhana).

## 10. Open Questions

Pertanyaan babak pertama sudah dijawab stakeholder (lihat ringkasan di §3, §6, §7 di atas: kebijakan cuti standar pemerintah, payroll sampai PPh21 tanpa BPJS, radius 100m tanpa pengecualian). Sisa pertanyaan yang masih perlu dijawab sebelum/selama eksekusi:

- **[Stakeholder/HR]** Siapa approver default untuk pengajuan cuti/koreksi absensi milik HR Admin atau Super Admin sendiri (karena self-approval dilarang secara desain — lihat §4)? Perlu ditunjuk minimal satu approver level atas (misal direksi/owner atau super admin lain).
- **[Engineering/Legal]** Meski stakeholder menyatakan belum ada aturan privasi data khusus yang perlu dipatuhi, perlu dicatat: **UU Pelindungan Data Pribadi (UU No. 27/2021)** berlaku otomatis untuk perusahaan Indonesia yang memproses data lokasi & foto wajah karyawan, terlepas dari apakah perusahaan punya kebijakan internal soal itu atau belum — ini bukan opsional. Rekomendasi minimum: siapkan mekanisme persetujuan eksplisit karyawan (consent) saat onboarding untuk pemrosesan data lokasi/foto, dan tentukan berapa lama data foto absensi disimpan sebelum dihapus/diarsipkan. Ini sebaiknya dikonfirmasi ke penasihat hukum internal/eksternal — saya bukan pengganti nasihat hukum resmi di sini.
- **[Stakeholder/Finance]** Untuk perhitungan PPh21: apakah semua karyawan berstatus karyawan tetap (PPh21 metode umum), atau ada karyawan kontrak/harian yang perlu skema pajak berbeda? Ini memengaruhi kompleksitas `TaxConfig`.
- **[Stakeholder]** Siapa yang akan memvalidasi hasil perhitungan PPh21 sistem sebelum dipakai untuk pembayaran gaji riil (lihat catatan risiko di §6)?

## 11. Timeline & Fasing (Rekomendasi)

**Fase 1 (MVP, ~6-8 minggu):** Autentikasi & role, data karyawan/cabang/departemen dasar, absensi (clock in/out + GPS + foto), dashboard sederhana.

**Fase 2 (~4-6 minggu):** Modul cuti/izin lengkap dengan approval berjenjang, saldo cuti, notifikasi email.

**Fase 3 (~5-7 minggu):** Laporan & dashboard HR lebih lengkap (filter, grafik tren); modul payroll — perhitungan gaji bruto → PPh21 → netto, tabel tarif/PTKP yang dapat dikonfigurasi, slip gaji, ekspor. *(Estimasi ditambah dibanding versi awal karena payroll sampai PPh21 kompleks — sisihkan waktu untuk uji paralel dengan perhitungan manual sebelum dipercaya penuh.)*

**Fase 4 (opsional, setelah MVP stabil):** Fitur P1 (jadwal shift, import massal, push notification) dan eksplorasi P2.

*Catatan: estimasi waktu asumsi 1-2 developer full-stack. Sesuaikan dengan kapasitas tim aktual.*

---

*Dokumen ini adalah hasil perencanaan awal. Setelah direview, langkah berikutnya adalah memecah Fase 1 menjadi task-task teknis konkret (breakdown ticket) untuk mulai eksekusi di VS Code.*
