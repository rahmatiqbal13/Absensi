# Spec: Laporan Kehadiran, Dashboard Filter/Refresh, Manajemen Departemen & Jadwal, Purge Foto (Plan 6)

**Status:** Disetujui untuk implementasi
**Tanggal:** 27 Agustus 2026
**Sumber:** `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md` §6 (Dashboard & Laporan HR), §8/§10 (retensi foto)
**Prasyarat:** Plan 1–5 selesai (Foundation, Attendance, Leave+Dashboard, Payroll, Employee Mgmt+Audit).

Sub-spec **Plan 6 dari rangkaian 6-plan — plan terakhir**. Menyelesaikan Fase 1+2 MVP.

---

## 1. Tujuan & Ruang Lingkup

Menutup empat sisa fitur MVP: laporan rekap kehadiran yang bisa diekspor, dashboard yang bisa
difilter per cabang dan menyegarkan diri, UI manajemen departemen & jadwal kerja, dan cron
penghapus foto absensi kadaluarsa (retensi 90 hari, UU PDP).

### Di dalam scope
- `src/lib/laporan/attendance-recap.ts` — logika rekap murni (unit-tested).
- `src/lib/laporan/recap-csv.ts` — serialisasi CSV (RFC-4180, unit-tested).
- `src/lib/schedule/validate-schedule.ts` — validasi jadwal murni (unit-tested).
- `src/app/(admin)/laporan/page.tsx` + `laporan/csv/route.ts` + `laporan/pdf/route.tsx`.
- `src/components/recap-document.tsx` — dokumen PDF rekap (`@react-pdf/renderer`, sudah ada).
- `src/app/(admin)/dashboard/page.tsx` (filter cabang) + `dashboard-controls.tsx` (client: select
  cabang + auto-refresh 30 dtk + tombol Muat Ulang).
- `src/app/(admin)/pengaturan/departemen/*` — CRUD departemen (hr_admin only).
- `src/app/(admin)/pengaturan/jadwal/*` — satu jadwal per cabang, edit di tempat (hr_admin only).
- `src/app/(admin)/pengaturan/page.tsx` — tambah link ke sub-halaman departemen & jadwal.
- `supabase/functions/purge-expired-photos/index.ts` — Edge Function penghapus foto kadaluarsa.
- Migrasi `0024` (RLS departemen/jadwal → `is_hr_admin_role()` + `work_schedules` unique(branch_id))
  dan `0025` (jadwal cron untuk Edge Function purge).

### Di luar scope
- Supabase **Realtime** subscription — keputusan: pakai polling 30 dtk + tombol manual (nol infra
  WebSocket, tak ada isu RLS-realtime). Menyimpang dari kata "Realtime subscription" di spec §6;
  hasil praktis (delay ≤30 dtk) memadai untuk konteks absensi.
- Dependency `xlsx` — keputusan: CSV (route handler `text/csv`, Excel & Sheets buka native, nol
  dependency) + PDF (`@react-pdf/renderer`). Menyimpang dari kata "xlsx" di spec §6.
- Grid harian karyawan×tanggal — hanya rekap per-karyawan per-periode.
- Slip gaji export — sudah selesai di Plan 4 (`/slip-gaji/[id]/pdf`, `/payroll/[periodId]`).
- PPh21/BPJS/lembur, notifikasi push, import Excel massal (Fase 3+).

---

## 2. Konstanta Global (mengikat semua task)

- TypeScript strict. npm. `npm test` unit; `npm run test:integration` live cloud.
- **Jangan kembalikan/tampilkan teks error Postgres/PostgREST mentah** — `console.error` mentah,
  pesan Indonesia tetap. Pola: `src/app/(admin)/persetujuan-cuti/actions.ts` (`mapRpcError`).
- **Ekstraksi jam/menit dari timestamp pinned Asia/Jakarta** — reuse `jakartaMinutesOfDay` /
  `scheduleMinutes` dari `src/lib/payroll/minutes.ts`. **Jangan** `getHours()`, `toISOString().slice()`,
  `toLocale*` tanpa `timeZone: "Asia/Jakarta"`. Tanggal-saja boleh parse UTC-midnight.
- **Server action mutasi selalu client user-scoped** (`createServerSupabaseClient()`) + gate
  `getCurrentEmployee` di awal (pola Plan 5): jika `!me || me.role not in (hr_admin, super_admin)` →
  `{ ok: false, error: "Tidak diizinkan." }`. RLS jadi lapisan kedua.
- **Delete lewat action pakai `.delete().eq(...).select("id")`** dan perlakukan array kosong sebagai
  gagal/tak-berhak (pelajaran Plan 5 M1 — RLS no-op yang mengembalikan `{ ok: true }` bohong).
- Route handler & Edge Function: client user-scoped untuk baca (`/laporan` export mengandalkan RLS
  `attendances_select` / `employees_select`), **service-role hanya** untuk Edge Function purge.
- `Role` type dari `@/lib/auth/route-access`. Ikon inline stroke SVG, bukan emoji. Badge/tabel/alert
  ikut konvensi `dashboard`/`payroll`/`karyawan`.
- To-one embed PostgREST (`branches(nama)`) → double-cast `as unknown as { nama: string } | null`.
- Supabase **cloud** — migrasi via `npx supabase db push`, **tak pernah** `db reset`/`truncate`/
  `delete from`. Migrasi terakhir: `0023`. Plan ini: `0024`, `0025`.
- `work_schedules.hari_kerja` = konvensi `getUTCDay()` (0=Minggu … 6=Sabtu), sama seperti payroll
  (`src/lib/payroll/effective-days.ts`).
- `@react-pdf/renderer` route handler = `route.tsx`, `export const runtime = "nodejs"`, `try/catch`
  di sekitar `renderToBuffer` (pola Plan 4 `slip-gaji/[payslipId]/pdf/route.tsx`).

---

## 3. Rekap Kehadiran — `src/lib/laporan/attendance-recap.ts`

Fungsi murni, tanpa I/O. Cermin bentuk `computePayrollForBranch` (Plan 4) tanpa uang.

```ts
type RecapEmployee = { id: string; nama: string; tanggalMulaiKerja: string | null };
type RecapAttendanceRow = { employee_id: string; tanggal: string; status: string; jam_masuk: string | null };
type RecapLeave = { employeeId: string; tanggalMulai: string; tanggalSelesai: string };
type RecapSchedule = { jamMasuk: string; jamPulang: string; toleransiMenit: number; hariKerja: number[] };

type RecapRow = {
  employeeId: string; nama: string;
  hadir: number; terlambat: number; pulangCepat: number; diLuarLokasi: number;
  alpa: number; cuti: number; lain: number;   // `lain` = status tak dikenal, tak pernah bocor ke alpa
  totalMenitTerlambat: number;
  hariKerjaEfektif: number;                    // hari kerja dalam rentang, pasca joinDate
};

computeAttendanceRecap(input: {
  from: string; to: string;                    // "YYYY-MM-DD" inklusif
  employees: RecapEmployee[];
  schedule: RecapSchedule;
  holidayDates: string[];
  attendancesByEmployee: Map<string, Map<string, RecapAttendanceRow>>;   // empId -> (tanggal -> row)
  approvedLeavesByEmployee: Map<string, RecapLeave[]>;
}): RecapRow[]
```

Implementasi: **iterasi tanggal `[from, to]` langsung** (loop harian, `new Date(\`${d}T00:00:00Z\`)`
untuk `dow`). Tidak memanggil `effectiveWorkDays` payroll (itu berbasis `year, month`; rentang di
sini bebas).

Aturan per karyawan:
- Hari kerja efektif = tanggal di `[from, to]` yang `dow ∈ hariKerja`, minus `holidayDates`, minus
  tanggal `< tanggalMulaiKerja`. `hariKerjaEfektif` = jumlahnya.
- Untuk tiap hari kerja efektif:
  - tercakup approved leave → `cuti += 1`.
  - ada baris absensi: bucket per `status` (`tepat_waktu`→`hadir`; `terlambat`→`terlambat`;
    `pulang_cepat`→`pulangCepat`; `di_luar_lokasi`→`diLuarLokasi`; `alpa`→`alpa`; lainnya→`lain`).
    Untuk `terlambat`, `totalMenitTerlambat += max(0, jakartaMinutesOfDay(jam_masuk) −
    (scheduleMinutes(jamMasuk) + toleransiMenit))`.
  - tak ada baris & bukan cuti → `alpa += 1`.
- `hadir + terlambat + pulangCepat + diLuarLokasi + alpa + cuti + lain === hariKerjaEfektif`
  (invariant, diuji).

Helper `round`/menit pinned Asia/Jakarta di-import dari `src/lib/payroll/minutes.ts` — jangan
duplikasi.

---

## 4. `/laporan` — halaman + export

### `src/app/(admin)/laporan/page.tsx` (server component)
- Gate: `getCurrentEmployee` + `redirect("/login")`; **tier `/dashboard`** — semua admin
  (`hr_admin`/`super_admin`/`atasan`) boleh (laporan adalah baca; RLS `attendances_select` /
  `employees_select` sudah `is_admin_role()`). Bukan hr_admin-only.
- Filter `searchParams`: `cabang?`, `dept?`, `dari?`, `sampai?`. Default: bulan berjalan
  (`dari` = tgl 1, `sampai` = hari ini, Asia/Jakarta).
- Muat: `branches` + `departments` (untuk dropdown, dept difilter by cabang bila cabang dipilih —
  atau tampilkan semua), `employees` (`status='aktif'`, filter cabang/dept), `work_schedules`
  (`.limit(1).maybeSingle()` per cabang — bila cabang tak dipilih, ambil schedule per cabang;
  MVP: bila cabang tak dipilih, gunakan filter cabang wajib ATAU pakai schedule cabang masing-masing
  employee — **keputusan plan**: cabang WAJIB dipilih untuk laporan agar satu schedule jelas),
  `holidays` (nasional + cabang, dalam rentang), `attendances` (`employee_id in`, rentang),
  `leave_requests` (`status='approved'`, overlap rentang).
- Jalankan `computeAttendanceRecap`, render tabel sortable (nama, hadir, terlambat, pulang cepat,
  luar lokasi, alpa, cuti, menit terlambat). Empty state + error state (pesan tetap).
- `[Unduh CSV]` / `[Unduh PDF]` = `<a href>` ke `/laporan/csv?<query>` / `/laporan/pdf?<query>`
  (query string sama).

**Keputusan:** `/laporan` **mewajibkan `cabang` dipilih** (default: cabang pertama secara
alfabetis, atau cabang milik admin). Menyederhanakan pemilihan `work_schedule` (satu per cabang).

### `src/lib/laporan/recap-csv.ts`
```ts
recapToCsv(rows: RecapRow[]): string
```
- Header: `Nama,Hadir,Terlambat,Pulang Cepat,Di Luar Lokasi,Alpa,Cuti,Menit Terlambat,Hari Kerja Efektif`.
- RFC-4180: field yang mengandung `,` `"` `\n` dibungkus `"..."`, `"` di dalam → `""`.
- Baris diakhiri `\r\n`. BOM `﻿` di awal (biar Excel Indonesia baca UTF-8 dengan benar).

### `src/app/(admin)/laporan/csv/route.ts`
`GET` — client user-scoped, gate (`getCurrentEmployee` admin), rakit data & `computeAttendanceRecap`
(reuse helper dari `page.tsx` — ekstrak logika rakit-data ke `src/lib/laporan/load-recap.ts` yang
dipanggil page + kedua route handler), `recapToCsv`, `new Response(csv, { headers: {
"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="laporan-kehadiran.csv"' } })`.

### `src/components/recap-document.tsx` + `src/app/(admin)/laporan/pdf/route.tsx`
`RecapDocument` (`@react-pdf/renderer` `<Document>`): kop (nama cabang, rentang), tabel rekap.
Route `pdf/route.tsx`: `runtime = "nodejs"`, gate, load-recap, `renderToBuffer(<RecapDocument/>)` di
`try/catch` → `application/pdf`. Fallback (bila `@react-pdf/renderer` bermasalah): route
mengembalikan CSV dengan pesan — tapi Plan 4 sudah membuktikan `@react-pdf/renderer` jalan, jadi
tak diharapkan.

---

## 5. Dashboard — filter cabang + auto-refresh

### `src/app/(admin)/dashboard/page.tsx`
- Hapus `const branchId = undefined`. `searchParams` → `branch?`. Teruskan ke
  `getTodaySummary(db, branch)` dan `getMonthlyTrend(db, branch)` (**keduanya sudah menerima
  `branchId`** — `src/lib/dashboard/attendance-summary.ts` & `monthly-trend.ts`; `monthly-trend`
  perlu ditambah param `branchId` bila belum ada — cek dulu).
- Muat `branches` untuk dropdown. Perbarui komentar RLS yang menyebut `branchId = undefined`.

### `src/app/(admin)/dashboard/dashboard-controls.tsx` (`"use client"`)
- `<select>` cabang (opsi "Semua cabang" + daftar) → `router.push("/dashboard?branch=" + v)` (kosong
  → tanpa param).
- Tombol "Muat ulang" → `router.refresh()`.
- `useEffect(() => { const id = setInterval(() => router.refresh(), 30_000); return () => clearInterval(id); }, [router])`.
- Label kecil "Diperbarui HH:MM:SS" (`Intl.DateTimeFormat("id-ID", { timeStyle: "medium",
  timeZone: "Asia/Jakarta" })`) yang di-set saat komponen mount / re-render.
- Test: pilih cabang → `router.push` dengan query benar; `setInterval` dipasang & `clearInterval`
  saat unmount (fake timers).

---

## 6. `/pengaturan/departemen`

### `page.tsx` (hr_admin/super_admin only — `redirect("/dashboard")` untuk selain itu)
- List `departments` + `branches(nama)` (embed double-cast), dikelompokkan per cabang, urut nama.
- Form tambah: `nama` (text) + `branchId` (select). Per baris: tombol Hapus (konfirmasi inline).
- Empty state + error state (pesan tetap).

### `actions.ts`
- `addDepartment(formData)`: gate `getCurrentEmployee` hr_admin; validasi `nama` non-kosong +
  `branchId` ada; insert user-scoped; `revalidatePath`. Error → `console.error` + pesan tetap.
- `deleteDepartment(id)`: gate; `.delete().eq("id", id).select("id")`; array kosong →
  `{ ok: false, error: "Gagal menghapus departemen atau Anda tidak berhak." }`.
  Catatan: `employees.department_id` FK `on delete set null` (migrasi 0001) — menghapus departemen
  hanya melepas anggotanya, tak ada cascade.

---

## 7. `/pengaturan/jadwal`

### `src/lib/schedule/validate-schedule.ts` (murni)
```ts
type ScheduleInput = { jamMasuk: string; jamPulang: string; hariKerja: number[]; toleransiMenit: number };
validateScheduleInput(raw: Record<string, FormDataEntryValue | null>):
  | { ok: true; value: ScheduleInput } | { ok: false; error: string }
```
- `jamMasuk` / `jamPulang` cocok `/^\d{2}:\d{2}$/`; `scheduleMinutes(jamPulang) > scheduleMinutes(jamMasuk)`.
- `hariKerja` ≥ 1 entri, tiap entri 0–6.
- `toleransiMenit` integer ≥ 0.

### `page.tsx` (hr_admin/super_admin only)
- Untuk **tiap** `branches`, satu form inline: `jam_masuk` / `jam_pulang` (`<input type="time">`),
  7 checkbox hari (Min–Sab, value 0–6), `toleransi_terlambat_menit` (number). Prefill dari
  `work_schedules` cabang itu (`.limit(1).maybeSingle()`).

### `actions.ts`
- `saveSchedule(branchId, formData)`: gate hr_admin; `validateScheduleInput`; **upsert**
  `.upsert({ branch_id: branchId, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit },
  { onConflict: "branch_id" })` user-scoped; `revalidatePath`. Error → pesan tetap.
  (Upsert `onConflict: "branch_id"` mengandalkan `unique(branch_id)` dari migrasi 0024.)

---

## 8. Purge Foto Absensi Kadaluarsa

Spec induk §10: *"v1 belum ada cron auto-delete fisik, hanya penandaan"* — Plan 6 menutup ini.

### `supabase/functions/purge-expired-photos/index.ts` (Deno Edge Function)
- Client service-role (dari `Deno.env` `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
- `select id, foto_masuk_url, foto_masuk_expires_at, foto_pulang_url, foto_pulang_expires_at
  from attendances where foto_masuk_expires_at < now() or foto_pulang_expires_at < now()`.
- Untuk tiap baris: kumpulkan path yang kadaluarsa. **Kolom `foto_*_url` menyimpan storage PATH**
  (`${employeeId}/${kind}-${ts}.jpg` — lihat `src/lib/attendance/photo-upload.ts:13`), bukan URL
  penuh; bila ada baris lama yang menyimpan URL penuh, strip prefix `.../attendance-photos/`.
- `storage.from("attendance-photos").remove(paths)` (batch, mis. 100 per panggilan).
- `update attendances set foto_masuk_url = null, foto_masuk_expires_at = null` untuk sisi masuk yang
  kadaluarsa (analog sisi pulang). Jalankan per-baris atau batch `in (...)`.
- Return `{ deletedPhotos: n, updatedRows: m }` JSON. Idempoten (baris yang sudah null tak ikut
  query lagi).
- Autorisasi: fungsi cek header `Authorization: Bearer <SERVICE_ROLE_KEY>` (atau `verify_jwt = false`
  + hanya dipanggil dari cron dengan service key). **Keputusan plan**: `verify_jwt = false` di
  `config.toml`, fungsi menolak bila `Authorization` bukan service-role key.

### Migrasi `0025_schedule_photo_purge.sql`
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Nightly 02:00 WIB (19:00 UTC prev day). The function URL + service key are
-- project-specific; the implementer fills <PROJECT_REF> and reads the key from
-- Vault (recommended) or inlines it. If pg_cron/pg_net setup proves fragile on
-- this project, FALL BACK to scheduling the function from the Supabase
-- dashboard (Edge Functions -> Schedules) and make this migration a no-op with
-- a comment pointing there.
select cron.schedule(
  'purge-expired-photos', '0 19 * * *',
  $$ select net.http_post(
       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-expired-photos',
       headers := jsonb_build_object('Authorization', 'Bearer ' || <service_key_source>)
     ) $$
);
```

### Fallback (jika pg_cron/pg_net bermasalah)
Migrasi `0025` hanya `create extension` + komentar; jadwalkan fungsi lewat Supabase dashboard
(Edge Functions → Schedules, cron `0 19 * * *`). Didokumentasikan di task.

---

## 9. Migrasi `0024_reporting_config_rls.sql`

```sql
-- departments_write / work_schedules_write: is_admin_role() -> is_hr_admin_role()
-- (konsisten dengan holidays_write, /karyawan, /payroll). Select policies tetap.
drop policy departments_write on departments;
create policy departments_write on departments
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());
drop policy work_schedules_write on work_schedules;
create policy work_schedules_write on work_schedules
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

-- work_schedules: one row per branch (app already assumes this via .limit(1))
alter table work_schedules add constraint work_schedules_branch_id_key unique (branch_id);
```

**Prasyarat task:** sebelum apply, jalankan
`select branch_id, count(*) from work_schedules group by 1 having count(*) > 1;`
Bila ada hasil → STOP, laporkan ke human cabang mana & jadwal mana yang harus disimpan sebelum
menambah constraint.

---

## 10. Testing

### Unit (`npm test`)
- `computeAttendanceRecap`: tiap bucket status, menit terlambat pinned Asia/Jakarta (uji lintas
  `process.env.TZ`), cuti overlap, alpa = residual, status tak dikenal → `lain` (bukan alpa),
  join tengah rentang, invariant jumlah = hariKerjaEfektif, rentang kosong.
- `recapToCsv`: escaping (koma/kutip/newline di nama), header, BOM, CRLF, angka.
- `validateScheduleInput`: format jam, urutan jam, hari kerja kosong / di luar 0–6, toleransi negatif.

### Integration (`npm run test:integration`, live cloud)
- `0024`: `atasan` insert/update `departments` → ditolak (`42501`); `hr_admin` → sukses.
  `atasan` update `work_schedules` → ditolak; `hr_admin` → sukses.
- `0024`: insert kedua `work_schedules` untuk `branch_id` yang sama → ditolak (unique).
- Edge Function `purge-expired-photos`: seed attendance + foto test terupload dengan
  `foto_masuk_expires_at` di masa lalu → invoke fungsi → foto hilang dari storage + kolom di-null;
  attendance dengan `expires_at` di masa depan tak tersentuh.

### Route handler (perlu dev server, `.skipIf` seperti Plan 4 `payslip-pdf.test.ts`)
- `/laporan/csv` → 200 `text/csv` + body non-trivial untuk admin.
- `/laporan/pdf` → 200 `application/pdf` untuk admin.

### Manual QA
Buat data absensi sebulan → `/laporan` pilih cabang + rentang → angka masuk akal → unduh CSV, buka
di Excel → unduh PDF. Dashboard: pilih cabang → angka berubah; tunggu 30 dtk → label "Diperbarui"
berubah. `/pengaturan/jadwal`: ubah toleransi → cek payroll periode berikutnya pakai nilai baru.

---

## 11. Urutan Task (estimasi ~15 task)

1. Migrasi `0024` (RLS + unique, dengan cek duplikat dulu) + integration test.
2. `computeAttendanceRecap` + test.
3. `recapToCsv` + test.
4. `src/lib/laporan/load-recap.ts` (rakit data, dipakai page + 2 route) + test (mock db).
5. `/laporan/page.tsx` (tabel + filter, cabang wajib) + build.
6. `/laporan/csv/route.ts` + route test.
7. `recap-document.tsx` + `/laporan/pdf/route.tsx` + route test.
8. `monthly-trend.ts` tambah param `branchId` (bila belum) + test.
9. `dashboard-controls.tsx` (client: select + refresh + interval) + test.
10. `dashboard/page.tsx` wiring `branch` searchParam + build.
11. `validateScheduleInput` + test.
12. `/pengaturan/departemen` (page + actions + form) + test + build.
13. `/pengaturan/jadwal` (page + actions + form) + test + build.
14. `/pengaturan/page.tsx` link departemen + jadwal (gated).
15. Edge Function `purge-expired-photos` + `config.toml` + migrasi `0025` (cron / fallback) +
    integration test.

---

## 12. Open Items (operasional, bukan blocker kode)

- Jadwal cron Edge Function: bila `pg_cron`/`pg_net` tak nyaman di project ini, jadwalkan manual di
  Supabase dashboard (didokumentasikan di task 15).
- Verifikasi retensi 90 hari & penghapusan fisik ke penasihat hukum internal sebelum go-live
  (spec induk §10) — proses, bukan kode.
- `/laporan` mewajibkan pilih cabang; laporan lintas-cabang (satu tabel semua cabang) = Fase 3 bila
  diminta.
