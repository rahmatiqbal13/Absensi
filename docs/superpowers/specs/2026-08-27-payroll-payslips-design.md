# Spec: Payroll & Slip Gaji Sederhana (Plan 4)

**Status:** Disetujui untuk implementasi
**Tanggal:** 27 Agustus 2026
**Sumber:** `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md` §7 (Gaji Harian Otomatis & Slip Gaji Sederhana), §6, §1
**Prasyarat:** Foundation (Plan 1), Attendance Module (Plan 2), Leave/Cuti + HR Dashboard (Plan 3) — semua selesai.

Ini adalah **sub-spec Plan 4 dari rangkaian 6-plan**. Sisa MVP dipecah:
- **Plan 4 (spec ini):** Payroll & slip gaji.
- **Plan 5:** Manajemen karyawan `/karyawan` + alur undang/set-password (menutup Foundation I1) + audit logging (§8) + manajemen `holidays`/`work_schedules`/`departments`.
- **Plan 6:** `/laporan` (rekap kehadiran + filter) + dashboard Realtime + export Excel (`xlsx`) & PDF rekap.

---

## 1. Tujuan & Ruang Lingkup

Menghitung `gaji_akhir` per karyawan per periode bulanan dari data `attendances` yang sudah ada:
**gaji pokok dikurangi potongan absansi proporsional**. Tanpa PPh21, BPJS, lembur, tunjangan
(itu Fase 3, di luar scope). HR admin klik "Generate" → payslip `draft` (bisa regenerate) →
"Finalisasi" → `final` (terkunci) → siap diekspor sebagai slip gaji PDF.

### Di dalam scope
- Library perhitungan murni (`src/lib/payroll/`), fully unit-tested.
- Dua RPC Postgres atomik: `generate_payroll`, `finalize_payroll`.
- Satu migrasi RLS (`0017`) memperketat write payroll ke `is_hr_admin_role()`.
- Halaman `(admin)/payroll`: daftar periode, buat periode, generate/regenerate, finalisasi, lihat payslip + `rincian_harian`.
- Route `(employee)/slip-gaji`: daftar payslip **final** milik sendiri + unduh PDF.
- Komponen PDF slip gaji (`@react-pdf/renderer`), dipakai ulang admin & karyawan.

### Di luar scope Plan 4 (dependensi hanya-baca)
- **Manajemen `holidays`:** Plan 4 hanya **membaca** tabel `holidays` apa adanya. Jika kosong,
  tidak ada hari libur yang dikurangi dari hari kerja efektif. UI manajemen libur = Plan 5.
- **Manajemen `work_schedules`:** dibaca apa adanya (satu baris per cabang; jika lebih dari satu,
  ambil `.limit(1).maybeSingle()` — pola yang sudah ditetapkan Plan 2 karena kolomnya non-unik).
- **Audit logging:** generate/finalize adalah target audit yang wajar, tapi infrastruktur
  `audit_logs` belum terpasang sama sekali dan dimiliki Plan 5. Plan 4 tidak menulis `audit_logs`.
- **Export Excel** dan halaman `/laporan` = Plan 6.
- Penyesuaian `gaji_pokok` karyawan: kolomnya sudah ada; UI edit = Plan 5. Untuk menguji Plan 4,
  `gaji_pokok` bisa diset langsung di DB.

---

## 2. Konstanta Global (mengikat semua task)

- TypeScript strict. Package manager: npm. `npm test` = unit cepat; `npm run test:integration` = live cloud.
- **Semua ekstraksi jam/menit dari timestamp pinned ke Asia/Jakarta** — reuse pola
  `src/lib/attendance/status.ts` (`Intl.DateTimeFormat` dengan `timeZone: "Asia/Jakarta"`).
  **Jangan** `Date.prototype.getHours()/getMinutes()`, `toISOString().slice(...)`,
  `toLocaleTimeString` tanpa opsi `timeZone` eksplisit. Kelas bug ini ditemukan & diperbaiki
  4× di Plan 2 dan 1× di Plan 3 — jangan ulangi.
- **Perhitungan tanggal-saja** (rentang cuti, hari dalam bulan) boleh pakai parse UTC-midnight
  (`new Date("YYYY-MM-DDT00:00:00Z")`) dan diff epoch — aman karena tak ada komponen jam,
  pola yang sudah ditetapkan di `src/lib/leave/balance.ts` dan `history-list.tsx`.
- **Jangan pernah kembalikan teks error Postgres/PostgREST mentah ke user.** Setiap fungsi/
  server action yang menyentuh DB: `console.error` error mentah, kembalikan pesan Indonesia tetap.
  Pola peta error: `src/app/(admin)/persetujuan-cuti/actions.ts` `RPC_ERROR_MESSAGES` + `mapRpcError`.
- **RPC payroll selalu dipanggil via client user-scoped** (`createServerSupabaseClient()`),
  **tidak pernah** service-role — cek `auth.uid()` di dalam RPC bergantung pada identitas pemanggil
  yang sebenarnya (pelajaran Plan 3 Task 7: service-role membuat cek `auth.uid()` jadi NULL-false
  = bypass diam-diam, bukan sekadar error fungsional).
- **RPC `SECURITY DEFINER`** dengan `set search_path = public`, dan **execute grant dibatasi**:
  `revoke execute ... from anon; grant execute ... to authenticated;` di migrasi yang sama —
  Plan 3 C1: `revoke from public` saja meninggalkan grant per-role `anon` yang dipasang bootstrap
  Supabase. Sertakan dump ACL sebagai bukti di komentar migrasi.
- `Role` type: import dari `@/lib/auth/route-access` — jangan redefinisi.
- Ikon: inline SVG stroke-based, bukan emoji. Design token & komponen mengikuti yang sudah ada
  (`SummaryCard`, `LeaveStatusBadge`, `AdminShell` sidebar, alert-banner amber).
- Supabase **cloud** (tanpa Docker lokal) — migrasi via `npx supabase db push`, **tidak pernah**
  `db reset`/`truncate`/`delete from`. Migrasi terakhir: `0016`. Plan ini mulai `0017`.
- `payroll_periods.branch_id` **NOT NULL** (migrasi `0004` menimpa teks spec induk yang bilang
  nullable) — payroll adalah **per-cabang**, satu baris per `(branch_id, bulan, tahun)`.

---

## 3. Model Data

Tidak ada perubahan kolom. Tabel dari migrasi `0003`:

```
payroll_periods  id, branch_id (NOT NULL), bulan (1..12), tahun,
                 status ('draft'|'final') default 'draft',
                 unique (branch_id, bulan, tahun)

payslips         id, employee_id, payroll_period_id,
                 gaji_pokok numeric(14,2), hari_kerja_efektif integer,
                 gaji_harian numeric(14,2), total_potongan_absensi numeric(14,2) default 0,
                 gaji_akhir numeric(14,2), rincian_harian jsonb default '[]',
                 unique (employee_id, payroll_period_id)
```

### Bentuk `rincian_harian` (array, satu elemen per hari kerja efektif)

```jsonc
{
  "tanggal": "2026-08-14",
  "jenis": "kerja" | "alpa" | "cuti" | "libur" | "luar_kantor",
  "status": "tepat_waktu" | "terlambat" | "pulang_cepat" | "alpa" | "di_luar_lokasi" | null,
  "menit_terlambat": 0,
  "menit_pulang_cepat": 0,
  "potongan": 0,
  "catatan": "pulang tidak tercatat"   // opsional
}
```

- `jenis: "libur"` tidak muncul (hari libur sudah dikeluarkan dari hari kerja efektif) — disimpan
  hanya bila berguna untuk transparansi; default: hanya hari kerja efektif yang di-list.
- `jenis: "cuti"` → `potongan: 0`, `catatan` = `"cuti_" + jenis_leave` (mis. `"cuti_tahunan"`).
- `jenis: "luar_kantor"` = status `di_luar_lokasi` → `potongan: 0`.

### Migrasi `0017_tighten_payroll_writes_to_hr_admin.sql`

- `drop policy payroll_periods_write`; `create policy payroll_periods_write ... using (is_hr_admin_role()) with check (is_hr_admin_role())`.
- `payslips`: tambahkan/ganti policy write (insert/update/delete) → `is_hr_admin_role()`.
  (`payslips_select` tetap: `employee_id = auth.uid() OR is_admin_role()`.)
- `payroll_periods_select` tetap `is_admin_role()` (atasan boleh lihat, konsisten dashboard).
- Definisi kedua RPC (§4). `revoke execute from anon; grant execute to authenticated;`.

---

## 4. Library Perhitungan — `src/lib/payroll/`

Semua modul murni (tanpa I/O), colokan `db` tidak ada di sini. Cermin split `src/lib/attendance/`.

### 4.1 `effective-days.ts`
```ts
effectiveWorkDays(params: {
  year: number; month: number;              // month 1..12
  hariKerja: number[];                       // work_schedules.hari_kerja (nilai dow apa adanya dari DB)
  holidayDates: string[];                    // "YYYY-MM-DD" yang berlaku utk cabang (nasional + cabang)
  joinDate?: string | null;                  // employees.tanggal_mulai_kerja
}): {
  fullMonthDays: string[];                   // semua tanggal kerja efektif sebulan penuh (utk pembagi gaji_harian)
  accrualDays: string[];                     // subset >= joinDate (hari yang benar-benar "diakui" utk karyawan ini)
}
```
- Tanggal dalam bulan yang `dow ∈ hariKerja`, minus `holidayDates`.
- `dow` dihitung dari tanggal-saja (UTC-midnight parse aman). Konvensi `hari_kerja` diverifikasi
  terhadap data cabang nyata saat task (Plan 2 sudah pakai kolom ini — samakan).
- `accrualDays` = `fullMonthDays` yang `>= joinDate` (jika `joinDate` di bulan itu). Hari sebelum
  join **tidak** dihitung alpa dan **tidak** dibayar.

### 4.2 `daily-wage.ts`
```ts
dailyWage(gajiPokok: number, fullMonthEffectiveDays: number): number
// = gajiPokok / fullMonthEffectiveDays, dibulatkan 2 desimal (half-up).
// Pembagi SELALU hari efektif sebulan penuh — joiner tengah bulan prorata lewat jumlah accrualDays yang lebih sedikit.
// fullMonthEffectiveDays === 0 -> return 0 (hindari div-by-zero; cabang tanpa hari kerja).
```

### 4.3 `deduction.ts`
```ts
LEAVE_COVERS_DATE(approvedLeaves, tanggal): { covered: boolean; jenis?: string }

dayDeduction(params: {
  tanggal: string;
  attendanceRow: { status: string; jam_masuk: string | null; jam_pulang: string | null } | null;
  schedule: { jamMasuk: string; jamPulang: string; toleransiMenit: number };  // "HH:MM[:SS]"
  dailyWage: number;
  leave: { covered: boolean; jenis?: string };
}): RincianHarianEntry
```
Aturan (urut prioritas):
1. `leave.covered` → `{ jenis: "cuti", status: null, potongan: 0, catatan: "cuti_" + leave.jenis }`.
2. `attendanceRow == null` → `{ jenis: "alpa", status: "alpa", potongan: dailyWage }`.
3. `status === "di_luar_lokasi"` → `{ jenis: "luar_kantor", potongan: 0 }` (spec §7: 0 sampai
   atasan reklasifikasi manual — UI reklasifikasi belum ada, jadi selalu 0).
4. `status === "alpa"` (kalau ada baris eksplisit) → `potongan: dailyWage`.
5. Selain itu (`tepat_waktu` / `terlambat` / `pulang_cepat`), hitung dua sisi lalu jumlah:
   - `menitKerjaHarian` = menit `jamMasuk`→`jamPulang` dari schedule (mis. 480).
   - **Sisi masuk:** `menitTerlambat = max(0, menit(jam_masuk) − (menit(jamMasuk) + toleransiMenit))`.
     `potonganMasuk = dailyWage × menitTerlambat / menitKerjaHarian`.
   - **Sisi pulang:** jika `jam_pulang == null` → `potonganPulang = 0`,
     `catatan = "pulang tidak tercatat"`. Selain itu
     `menitPulangCepat = max(0, menit(jamPulang) − menit(jam_pulang))`,
     `potonganPulang = dailyWage × menitPulangCepat / menitKerjaHarian`.
   - `potongan = round2(potonganMasuk) + round2(potonganPulang)`; `status` = status baris apa adanya.
- Ekstraksi menit dari `jam_masuk`/`jam_pulang` (timestamptz) **pinned Asia/Jakarta**.
- Parse `"HH:MM"` / `"HH:MM:SS"` dari kolom `time` — keduanya harus didukung.

### 4.4 `compute.ts`
```ts
computePayrollForBranch(input: {
  year: number; month: number;
  employees: { id: string; gajiPokok: number; tanggalMulaiKerja: string | null }[];
  schedule: { jamMasuk: string; jamPulang: string; toleransiMenit: number; hariKerja: number[] };
  holidayDates: string[];
  attendancesByEmployee: Map<string, Map<string, AttendanceRow>>;   // employeeId -> (tanggal -> row)
  approvedLeavesByEmployee: Map<string, ApprovedLeave[]>;
}): PayslipRow[]
```
- Untuk tiap karyawan: `effectiveWorkDays` → `fullMonthDays`/`accrualDays`;
  `dailyWage(gajiPokok, fullMonthDays.length)`; untuk tiap `accrualDays` → `dayDeduction` →
  kumpulkan `rincian_harian`.
- `hari_kerja_efektif = accrualDays.length` (yang disimpan di payslip — merefleksikan hari yang
  diakui utk karyawan ini).
- `total_potongan_absensi = Σ potongan` (sudah dibulatkan per baris).
- `gaji_akhir = round2(gajiPokok − total_potongan_absensi)`; floor di 0 (tidak boleh negatif).
- Return array siap-insert: `{ employee_id, gaji_pokok, hari_kerja_efektif, gaji_harian,
  total_potongan_absensi, gaji_akhir, rincian_harian }`.

Helper pembulatan `round2(n)` (half-up) di modul kecil sendiri atau di `compute.ts`.

---

## 5. Persist Atomik — RPC (di migrasi `0017`)

### `generate_payroll(p_period_id uuid, p_rows jsonb) returns setof payslips`
`language plpgsql`, `security definer`, `set search_path = public`.
1. Cek auth: `auth.uid()` NOT NULL DAN `is_hr_admin_role()` — else `raise exception 'only hr admin may run payroll'`.
2. `select ... into v_period from payroll_periods where id = p_period_id for update;`
   NOT FOUND → `raise 'payroll period not found'`.
3. `if v_period.status = 'final' then raise 'payroll period is finalized';`
4. `delete from payslips where payroll_period_id = p_period_id;` (regenerate bersih).
5. `insert into payslips (payroll_period_id, employee_id, gaji_pokok, hari_kerja_efektif,
   gaji_harian, total_potongan_absensi, gaji_akhir, rincian_harian)
   select p_period_id, x.* from jsonb_to_recordset(p_rows) as x(employee_id uuid, gaji_pokok numeric,
   hari_kerja_efektif int, gaji_harian numeric, total_potongan_absensi numeric, gaji_akhir numeric,
   rincian_harian jsonb);`
6. `return query select * from payslips where payroll_period_id = p_period_id;`
7. Status **tetap `draft`**.

### `finalize_payroll(p_period_id uuid) returns payroll_periods`
1. Cek auth sama.
2. `for update` lock period. NOT FOUND → raise.
3. `if status = 'final' then raise 'payroll period is already finalized';`
4. `if (select count(*) from payslips where payroll_period_id = p_period_id) = 0 then
   raise 'cannot finalize a payroll period with no payslips';`
5. `update payroll_periods set status = 'final' where id = p_period_id returning * ...`.

Tidak ada fungsi "un-finalize" di Plan 4 (koreksi pasca-final = di luar scope MVP; operasional).

### Server action `src/app/(admin)/payroll/actions.ts`
- `createPayrollPeriod(branchId, bulan, tahun)` → insert `payroll_periods` (tangani unique violation
  → pesan "Periode ini sudah ada").
- `generatePayroll(periodId)`:
  1. `db` user-scoped; ambil `period` (→ `branch_id`, `bulan`, `tahun`).
  2. Query paralel: `employees` (`status='aktif'`, `branch_id`), `work_schedules` (`.limit(1).maybeSingle()`),
     `holidays` (`branch_id IS NULL OR branch_id = <branch>`, `tanggal` dalam bulan),
     `attendances` (`employee_id IN (...)`, `tanggal` dalam bulan),
     `leave_requests` (`status='approved'`, `employee_id IN (...)`, rentang beririsan bulan).
     Setiap query: cek `error`, `console.error`, pesan Indonesia tetap (jangan zeros diam-diam).
  3. `computePayrollForBranch(...)` di TS.
  4. `db.rpc('generate_payroll', { p_period_id: periodId, p_rows: rows })`; `mapRpcError` pada error.
  5. `revalidatePath('/payroll/' + periodId)`.
- `finalizePayroll(periodId)` → `db.rpc('finalize_payroll', ...)` + `mapRpcError` + `revalidatePath`.
- Peta error RPC → Indonesia: `'only hr admin may run payroll'`, `'payroll period is finalized'`,
  `'payroll period is already finalized'`, `'cannot finalize a payroll period with no payslips'`,
  `'payroll period not found'`.

---

## 6. Halaman `(admin)/payroll`

**Route-access:** tambahkan `/payroll` ke daftar prefix admin di `@/lib/auth/route-access`, dibatasi
`hr_admin`/`super_admin` (bukan `atasan`). RLS `0017` jadi backstop. Tambah item nav di `AdminShell`.

### `payroll/page.tsx` — daftar periode
- Tabel: Cabang · Bulan/Tahun · Status (badge draft/final) · Jumlah payslip · Total `gaji_akhir` (rupiah).
- Form "Buat Periode": select cabang, select bulan (1–12), input tahun (default tahun berjalan
  Asia/Jakarta). Submit → `createPayrollPeriod`.
- Empty state kalau belum ada periode.

### `payroll/[periodId]/page.tsx` — detail
- Header: cabang, bulan/tahun, status. Tombol **Generate/Regenerate** (aktif hanya `draft`),
  **Finalisasi** (aktif hanya `draft` & ada payslip; konfirmasi dulu — pola konfirmasi
  `persetujuan-cuti`).
- Tabel payslip: Nama · Gaji pokok · Hari efektif · Total potongan · Gaji akhir. Baris bisa
  di-expand → render `rincian_harian` (tanggal, jenis, status badge, menit, potongan).
- Kolom aksi: link "Unduh PDF" → `/(employee-or-admin) slip-gaji/[payslipId]/pdf` (route handler §7).
- Kalau belum di-generate: pesan "Belum ada payslip. Klik Generate."

### Komponen
- `PayrollStatusBadge` (`draft`/`final`) — ikon + warna + label, pola `LeaveStatusBadge`.
- `RupiahText` helper format `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`.

---

## 7. `(employee)/slip-gaji` + PDF

### `slip-gaji/page.tsx`
- Query payslip milik `auth.uid()` yang **`payroll_periods.status = 'final'`** (join/embed
  PostgREST: `payslips` dengan filter `payroll_period_id.status=eq.final` via
  `payroll_periods!inner(status,bulan,tahun)` — sintaks diverifikasi terhadap skema FK saat task,
  pola Plan 3 Task 8 `employees!inner`).
- Daftar: Bulan/Tahun · Gaji akhir · tombol "Unduh PDF". Terbaru dulu. Empty state.
- Draft **tidak** ditampilkan ke karyawan (filter aplikasi; RLS `payslips_select` masih
  `own OR admin` tanpa filter status — dicatat sebagai batasan minor, bukan blocker).

### Route handler PDF — `slip-gaji/[payslipId]/pdf/route.ts`
- `GET`: `db` user-scoped → ambil payslip (RLS memastikan hanya own/admin) + join period +
  employee + branch. Kalau tak ketemu → 404.
- Render `@react-pdf/renderer` (`renderToBuffer`) komponen `PayslipDocument` → `new Response(buffer,
  { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename=...' } })`.
- Route ini berada di grup `(employee)` yang terbuka untuk semua role login (spec induk §1);
  link "Unduh PDF" di `(admin)/payroll/[periodId]` memakai route handler yang sama — RLS
  `payslips_select` (`own OR is_admin_role()`) yang menentukan siapa boleh mengambil payslip mana.
- `PayslipDocument` (`src/components/payslip-document.tsx`): kop (nama perusahaan/cabang),
  identitas karyawan, periode, tabel ringkas (gaji pokok, hari efektif, gaji harian, total potongan,
  gaji akhir), opsional ringkas `rincian_harian`. Dipakai ulang oleh link admin.

### Risiko & fallback (diputuskan saat task PDF, bukan blocker desain)
`@react-pdf/renderer` kadang bentrok dengan React 19.2 / Next 16.3 (SSR/bundler). Jika integrasi
gagal setelah usaha wajar: **fallback** = `slip-gaji/[payslipId]/page.tsx` HTML ber-`@media print`
+ tombol `window.print()` ("Simpan sebagai PDF"), nol dependency baru. Task PDF menulis test
integrasi ringan (route mengembalikan `Content-Type` benar & status 200 untuk pemilik, 404 untuk
orang lain) apa pun jalur yang dipakai.

---

## 8. Testing

### Unit (`npm test`)
- `effective-days`: single-day month boundary, tahun kabisat (Feb 2028), libur nasional
  (`branch_id null`) vs libur cabang lain (tidak berlaku), `hari_kerja` subset, `joinDate` tengah
  bulan (fullMonthDays utuh, accrualDays terpotong), `joinDate` sebelum bulan (tak berpengaruh).
- `daily-wage`: pembagi nol → 0; pembulatan half-up.
- `deduction`: tiap cabang aturan — cuti approved (0 + label), alpa (baris null), `di_luar_lokasi`
  (0), `alpa` eksplisit, terlambat dalam toleransi (0), terlambat lewat toleransi (menit dihitung
  dari jadwal+toleransi), pulang_cepat, `jam_pulang null` (sisi pulang 0 + catatan),
  tepat_waktu (0).
- `compute`: 2–3 karyawan, campur libur + cuti + alpa + terlambat; verifikasi
  `hari_kerja_efektif`, `total_potongan_absensi`, `gaji_akhir` floor 0, bentuk `rincian_harian`.
- Verifikasi timezone: `deduction`/`compute` menghitung menit sama di TZ proses berbeda
  (pola Plan 2 — set `process.env.TZ` di test).

### Integration (`npm run test:integration`, live cloud)
- `generate_payroll`: hr_admin generate → payslip terisi; regenerate → hapus+isi ulang (bukan
  duplikat, unique `(employee_id, payroll_period_id)` tetap terjaga); `atasan` ditolak
  (`only hr admin`); period `final` ditolak (`payroll period is finalized`).
- `finalize_payroll`: sukses draft→final; tolak finalisasi kedua; tolak jika 0 payslip;
  `atasan` ditolak.
- PDF route: 200 + `application/pdf` untuk pemilik payslip; 404 untuk user lain.
- Bukti grant: `anon` tidak punya execute pada kedua RPC (`has_function_privilege` = false).

### Manual QA
Ikuti acceptance criteria PRD §6 "Laporan & Dashboard HR" bagian payroll: generate → angka masuk
akal terhadap absensi bulan itu → regenerate setelah koreksi absensi → finalisasi → unduh slip PDF
sebagai admin & sebagai karyawan.

---

## 9. Urutan Task (estimasi ~12 task)

1. `effective-days.ts` + test
2. `daily-wage.ts` + `round2` helper + test
3. `deduction.ts` + test
4. `compute.ts` + test
5. Migrasi `0017` (RLS tighten + `generate_payroll` + `finalize_payroll`) + integration test
6. `payroll/actions.ts` (createPeriod, generate, finalize + error map) + test
7. `PayrollStatusBadge` + `RupiahText` + test
8. `payroll/page.tsx` (daftar + buat periode)
9. `payroll/[periodId]/page.tsx` (detail + generate/finalize + rincian)
10. route-access `/payroll` + `AdminShell` nav
11. `payslip-document.tsx` + `slip-gaji/[payslipId]/pdf/route.ts` (+ fallback jika perlu) + integration test
12. `(employee)/slip-gaji/page.tsx` + build verify

---

## 10. Open Items (operasional, bukan blocker kode)

- Validasi hasil perhitungan gaji oleh staf HR/akuntan (paralel run beberapa periode pertama)
  sebelum dipakai pembayaran riil — spec induk §9.
- Kebijakan pembulatan rupiah final (ke rupiah terdekat? ke 100 terdekat?) — Plan 4 pakai 2
  desimal `numeric(14,2)`; jika HR minta pembulatan ke rupiah bulat, itu perubahan satu baris di
  `round2`/`compute` yang bisa menyusul.
