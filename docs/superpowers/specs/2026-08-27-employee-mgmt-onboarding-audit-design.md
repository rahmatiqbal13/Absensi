# Spec: Manajemen Karyawan + Onboarding + Audit + Libur (Plan 5)

**Status:** Disetujui untuk implementasi
**Tanggal:** 27 Agustus 2026
**Sumber:** `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md` §3 (Auth & RBAC, invite-only), §8 (Audit log), §2
**Prasyarat:** Plan 1 (Foundation), Plan 2 (Attendance), Plan 3 (Leave + Dashboard), Plan 4 (Payroll) — semua selesai.

Sub-spec **Plan 5 dari rangkaian 6-plan**. Menutup Foundation I1 (karyawan yang diundang tak
bisa login) dan I6/eskalasi-lateral (atasan bisa ubah role/gaji karyawan lain).
- **Plan 5 (spec ini):** `/karyawan` CRUD, onboarding (link set-password yang ditampilkan ke HR),
  authz field terproteksi, penolakan sesi untuk karyawan nonaktif, audit logging (trigger employees
  + retrofit RPC cuti), `/pengaturan/audit`, `/pengaturan/libur` + seed libur nasional 2026.
- **Plan 6 (berikutnya):** manajemen departemen & jadwal kerja, `/laporan` (rekap kehadiran +
  filter), dashboard Realtime, export Excel/PDF.

---

## 1. Tujuan & Ruang Lingkup

HR admin dapat merekrut karyawan (invite-only, tanpa signup publik), mengelola data mereka,
menonaktifkan/mengaktifkan, dan menelusuri setiap perubahan lewat audit trail. Karyawan baru
menetapkan password sendiri lewat link yang HR kirim manual (chat/WA) — tanpa infrastruktur email.

### Di dalam scope
- `src/lib/employees/` — `validateEmployeeInput` (murni, unit-tested); `inviteEmployee` di-rework.
- `src/app/(admin)/karyawan/` — `page.tsx` (list + filter), `baru/page.tsx` (create), `[id]/page.tsx`
  (detail + edit + nonaktif + riwayat audit), server actions.
- `src/app/(auth)/set-password/page.tsx` — halaman tukar-token → set password.
- `src/app/(admin)/pengaturan/audit/page.tsx` — viewer `audit_logs` (read-only, hr_admin).
- `src/app/(admin)/pengaturan/libur/page.tsx` — CRUD `holidays` (hr_admin).
- `scripts/seed-holidays-2026.ts` — seed libur nasional 2026 (idempotent, dijalankan sekali).
- Migrasi `0018` (2 trigger baru + `holidays_write` diperketat), `0019` (retrofit audit di RPC cuti).
- `getCurrentEmployee` + `src/proxy.ts` + `(admin)/layout.tsx` — tolak karyawan `status != 'aktif'`.
- `route-access.ts` + `admin-shell.tsx` — `/karyawan` jadi hr_admin-only.

### Di luar scope Plan 5
- Manajemen `departments` & `work_schedules` (Plan 6). `departments_write`/`work_schedules_write`
  RLS **tidak** diubah di Plan 5.
- Email (SMTP/Resend) — onboarding pakai link yang ditampilkan, bukan email.
- Import massal Excel, foto profil upload, ganti password mandiri di `/profil` (Fase berikutnya).
- Hard-delete karyawan lewat UI — hanya nonaktif (soft). Trigger audit tetap menangani `DELETE`
  bila terjadi lewat jalur lain.

---

## 2. Konstanta Global (mengikat semua task)

- TypeScript strict. npm. `npm test` unit; `npm run test:integration` live cloud.
- **Jangan pernah kembalikan teks error Postgres/PostgREST mentah ke user** — `console.error` error
  mentah, kembalikan pesan Indonesia tetap. Pola peta error: `src/app/(admin)/persetujuan-cuti/actions.ts`.
- **Mutasi karyawan lewat `/karyawan` dipanggil dengan client user-scoped** (`createServerSupabaseClient()`),
  supaya RLS + trigger menegakkan aturan berdasarkan identitas pemanggil sebenarnya. **Pengecualian:**
  `inviteEmployee` wajib service-role (butuh `auth.admin.*`) — ini satu-satunya jalur service-role,
  dan RLS di-bypass secara sadar (tak ada `employees_insert` policy untuk klien).
- **Trigger baru `SECURITY DEFINER` + `set search_path = public`.** Migrasi mengubah RPC cuti
  (`0019`) memakai pola yang sama seperti `0014`/`0016`: `create or replace` mempertahankan seluruh
  body versi terakhir (`0016`), lalu `revoke execute ... from public, anon` + `grant ... to
  authenticated, service_role` diulang di migrasi yang sama (anon dinamai eksplisit — lihat komentar
  C1 di `0014`).
- `Role` type: import dari `@/lib/auth/route-access`. Ikon: inline stroke SVG, bukan emoji.
  Badge/tabel/alert mengikuti konvensi `dashboard`/`persetujuan-cuti`/`payroll`.
- Supabase **cloud** — migrasi via `npx supabase db push`, **tidak pernah** `db reset`/`truncate`/
  `delete from`. Migrasi terakhir: `0017`. Plan ini: `0018`, `0019`.
- Perhitungan tanggal-saja boleh parse UTC-midnight; jangan `getHours()`/`toLocale*` tanpa
  `timeZone: "Asia/Jakarta"` untuk komponen jam.
- `employees` protected fields (dipakai oleh trigger `0018` dan sebagai daftar field non-editable
  bagi non-hr-admin): `role`, `gaji_pokok`, `branch_id`, `atasan_id`, `designated_approver_id`,
  `status_kontrak`, `status`, `tanggal_mulai_kerja`, `email`.

---

## 3. Onboarding — link set-password

### `src/lib/employees/invite.ts` (rework)
```ts
type InviteEmployeeInput = { /* field employees + role: Role */ };
type InviteEmployeeResult =
  | { ok: true; employeeId: string; setPasswordUrl: string }
  | { ok: false; error: string };

inviteEmployee(input: InviteEmployeeInput, db: SupabaseClient /* service-role */): Promise<InviteEmployeeResult>
```
Alur:
1. Validasi: `designatedApproverId` wajib bila `role ∈ {hr_admin, super_admin}` (pertahankan cek
   yang sudah ada).
2. `db.auth.admin.generateLink({ type: "invite", email: input.email, options: { redirectTo: <APP_URL>/set-password } })`
   → membuat auth user + mengembalikan `data.properties.action_link`. (Jika versi supabase-js
   terpasang tidak membuat user lewat `generateLink` type invite, fallback: `auth.admin.createUser({
   email, email_confirm: true })` lalu `generateLink({ type: "recovery", email })` — diputuskan
   saat task terhadap API nyata.)
3. Insert baris `employees` dengan `id = <auth user id>`. Jika gagal → `auth.admin.deleteUser(id)`
   (pertahankan logging rollback yang ada) → return error.
4. Return `{ ok: true, employeeId, setPasswordUrl: action_link }`.

`<APP_URL>` dari env (`NEXT_PUBLIC_APP_URL` atau `NEXT_PUBLIC_SITE_URL` — cek yang sudah ada; kalau
belum ada, tambahkan ke `.env.local` + dokumentasikan). `redirectTo` wajib terdaftar di allowlist
"Redirect URLs" project Supabase — dokumentasikan langkah manual ini di task.

### `src/app/(admin)/karyawan/baru/page.tsx`
Form → server action `createEmployee(formData)` → `inviteEmployee(input, createServiceRoleSupabaseClient())`.
Pada sukses, render kotak salin: **"Kirim link berikut ke karyawan (berlaku terbatas):"** + `setPasswordUrl`
+ tombol "Salin". Tidak ada pengiriman email.

### `src/app/(auth)/set-password/page.tsx` (client component, route publik)
1. Baca token dari URL. supabase-js v2 default (implicit flow) menaruh `#access_token`/`#refresh_token`
   di hash; jika project pakai PKCE, `?code=` di query → `supabase.auth.exchangeCodeForSession`.
   Task menentukan yang benar terhadap konfigurasi nyata; tangani KEDUA bentuk secara defensif.
2. Bentuk sesi (`setSession` / `exchangeCodeForSession`). Jika token invalid/kedaluwarsa →
   pesan jelas + "Minta link baru ke HR." (tanpa bocor detail).
3. Form: password (min 8 karakter) + konfirmasi → `supabase.auth.updateUser({ password })`.
4. Sukses → redirect `/absen`. (Semua peran diarahkan ke `/absen` dulu; middleware akan
   mengarahkan ulang admin ke `/dashboard` bila perlu — konsisten dengan login flow yang ada.)

---

## 4. Manajemen Karyawan — `/karyawan`

**Route-access:** tambahkan `/karyawan` ke `HR_ADMIN_PATH_PREFIXES` di `@/lib/auth/route-access`
(mekanisme `redirect-admin-home` + filter nav `admin-shell.tsx` sudah ada dari Plan 4).

### `src/lib/employees/employee-form.ts` (murni, unit-tested)
```ts
type EmployeeFormInput = {
  nama: string; email: string; jabatan: string; statusKontrak: string;
  tanggalMulaiKerja: string; gajiPokok: number; role: Role;
  branchId: string; departmentId?: string | null;
  atasanId?: string | null; designatedApproverId?: string | null;
};
validateEmployeeInput(raw: Record<string, FormDataEntryValue | null>):
  | { ok: true; value: EmployeeFormInput }
  | { ok: false; error: string };
```
- Wajib: nama, email (format valid), jabatan, statusKontrak, tanggalMulaiKerja (YYYY-MM-DD),
  role (∈ Role), branchId.
- `gajiPokok` → Number, `>= 0`, default 0.
- `designatedApproverId` wajib bila `role ∈ {hr_admin, super_admin}`.
- Dipakai `createEmployee` dan `updateEmployee`.

### `karyawan/page.tsx` (server component, hr_admin/super_admin)
- Query `employees` + `branches(nama)` (embed to-one → `as unknown as` double-cast, pola Plan 4).
- Kolom: nama, jabatan, cabang, role (badge), status (badge aktif/nonaktif).
- Filter: cabang (select), role (select), status (select, default `aktif`). Pencarian teks `nama`
  (`.ilike("nama", "%q%")`). Filter diterapkan di query, bukan client.
- Baris → `Link` ke `/karyawan/[id]`. Tombol "Tambah Karyawan" → `/karyawan/baru`.
- Empty state; error state (pesan tetap, bukan tabel kosong diam-diam).

### `karyawan/[id]/page.tsx`
- Detail + form edit (field sama seperti create, minus email bila mau — email tetap ditampilkan
  read-only karena termasuk protected; boleh diedit hanya oleh hr_admin lewat form, trigger yang
  menegakkan).
- Server action `updateEmployee(id, formData)` → `validateEmployeeInput` → update via **client
  user-scoped**. Error trigger (`not allowed to change protected employee fields`) dipetakan ke
  "Anda tidak berhak mengubah data terproteksi karyawan." Sukses → `revalidatePath`.
- Tombol "Nonaktifkan" (→ `status='nonaktif'`) / "Aktifkan kembali" (→ `status='aktif'`), dengan
  konfirmasi inline (pola `payslip-table`).
- Bagian "Riwayat Perubahan": query `audit_logs` `.eq("target_employee_id", id)`
  `.order("waktu", desc)` `.limit(50)`, tampilkan waktu + aksi (badge) + aktor + ringkasan detail.

---

## 5. Authz & sesi nonaktif

### Migrasi `0018` — trigger field terproteksi
```sql
create or replace function prevent_protected_employee_field_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_hr_admin_role() = false then
    if new.role is distinct from old.role
       or new.gaji_pokok is distinct from old.gaji_pokok
       or new.branch_id is distinct from old.branch_id
       or new.atasan_id is distinct from old.atasan_id
       or new.designated_approver_id is distinct from old.designated_approver_id
       or new.status_kontrak is distinct from old.status_kontrak
       or new.status is distinct from old.status
       or new.tanggal_mulai_kerja is distinct from old.tanggal_mulai_kerja
       or new.email is distinct from old.email
    then
      raise exception 'not allowed to change protected employee fields';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_prevent_protected_employee_field_change
  before update on employees for each row
  execute function prevent_protected_employee_field_change();
```
Melengkapi `prevent_employee_self_privilege_escalation` (yang hanya menyala saat `auth.uid() =
old.id`). Trigger baru menyala untuk baris SIAPA PUN → menutup atasan-edit-orang-lain. Overlap pada
self-edit tidak masalah (hasil sama). `inviteEmployee` (service-role) tidak terpengaruh: trigger ini
BEFORE UPDATE, insert tidak menyalakannya; dan `is_hr_admin_role()` di bawah service-role =
false-vacuous tapi tak ada UPDATE saat invite.

**Catatan:** `updateEmployee` untuk hr_admin memakai client user-scoped, jadi `is_hr_admin_role()`
di dalam trigger benar-benar mengevaluasi peran hr_admin pemanggil → lolos. Untuk atasan → ditolak.

### Migrasi `0018` — `holidays_write` diperketat
`drop policy holidays_write on holidays;` `create policy holidays_write on holidays for all using
(is_hr_admin_role()) with check (is_hr_admin_role());` (`holidays_select` tetap `authenticated`).

### Sesi nonaktif
- `CurrentEmployee` (di `src/lib/auth/session.ts`) tambah field `status: 'aktif' | 'nonaktif'`.
  `getCurrentEmployee` select `status`; **return `null` bila `status !== 'aktif'`** (perlakuan sama
  seperti tidak login → semua guard yang ada otomatis menolak).
- `src/proxy.ts`: tak perlu perubahan bila `getCurrentEmployee` sudah menolak — tapi proxy pakai
  query inline sendiri (`select role`). Tambah `status` di query proxy; `role = null` bila
  `status != 'aktif'` → `resolveRouteAccess` mengembalikan `redirect-login`.
- Login page (`(auth)/login/page.tsx`): bila query param `?reason=nonaktif` (di-set oleh proxy saat
  redirect), tampilkan "Akun Anda nonaktif. Hubungi HR." — pola pesan tetap (jangan pantulkan teks
  error mentah; ini pesan aplikasi, aman).

---

## 6. Audit Logging

### Migrasi `0018` — trigger `audit_employee_changes`
```sql
create or replace function audit_employee_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_aksi text;
  v_target uuid := coalesce(new.id, old.id);
begin
  if tg_op = 'INSERT' then
    v_aksi := 'employee_created';
  elsif tg_op = 'DELETE' then
    v_aksi := 'employee_deleted';
  elsif new.status is distinct from old.status then
    v_aksi := case when new.status = 'nonaktif' then 'employee_deactivated'
                   else 'employee_reactivated' end;
  else
    v_aksi := 'employee_updated';
  end if;

  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_target, v_aksi,
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)),
    auth.uid() is not null and auth.uid() = v_target
  );
  return coalesce(new, old);
end;
$$;
create trigger trg_audit_employee_changes
  after insert or update or delete on employees for each row
  execute function audit_employee_changes();
```
- `actor_id` bisa `null` saat aksi lewat service-role (mis. `inviteEmployee` insert) — itu benar
  dan berguna (menandai "aksi sistem/invite"). `audit_logs.actor_id` nullable (0003).
- Tidak ada redaksi field: `audit_logs` hanya bisa dibaca `is_admin_role()` (0005).

### Migrasi `0019` — retrofit audit di RPC cuti
`create or replace` `approve_leave_request` dan `reject_leave_request` — salin body VERBATIM dari
`0016` (versi live), tambahkan tepat sebelum `return`:
```sql
insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
values (
  auth.uid(), v_request.employee_id,
  '<leave_approved | leave_rejected>',
  jsonb_build_object('request_id', v_request.id, 'jenis', v_request.jenis,
    'tanggal_mulai', v_request.tanggal_mulai, 'tanggal_selesai', v_request.tanggal_selesai,
    'catatan', p_catatan),
  auth.uid() is not null and auth.uid() = v_request.employee_id
);
```
Ulangi `revoke execute ... from public, anon` + `grant ... to authenticated, service_role` untuk
kedua fungsi di migrasi yang sama. Jangan ubah `generate_payroll`/`finalize_payroll` (`0017`).

### `src/app/(admin)/pengaturan/audit/page.tsx` (hr_admin/super_admin)
- Query `audit_logs` + join nama aktor & target (`actor:employees!audit_logs_actor_id_fkey(nama)`,
  `target:employees!audit_logs_target_employee_id_fkey(nama)` — cek nama constraint FK nyata saat
  task; `audit_logs` punya 2 FK ke `employees` → butuh hint disambiguasi seperti `leave_requests`).
- Kolom: waktu (Asia/Jakarta), aktor, target, aksi (badge), detail (tombol expand → `<pre>` jsonb).
- Filter: rentang tanggal (`.gte`/`.lte` `waktu`), target karyawan (select), aksi (select).
  `.order("waktu", desc).limit(100)`.
- Read-only. Error/empty state pesan tetap.
- Komponen `AuditAksiBadge` (ikon+warna+label per aksi) — pola `LeaveStatusBadge`.

---

## 7. Manajemen Libur — `/pengaturan/libur`

### `scripts/seed-holidays-2026.ts` (idempotent, dijalankan sekali)
- Daftar `HOLIDAYS_2026` sebagai konstanta `{ tanggal, nama }[]` (semua `branch_id = null` =
  nasional). Nilai awal = perkiraan terbaik libur nasional Indonesia 2026 dengan komentar
  **"WAJIB DIVERIFIKASI terhadap SKB 3 Menteri 2026 resmi sebelum dipakai payroll riil"** — tanggal
  hari raya Islam (Isra Mikraj, Idul Fitri, Idul Adha, Tahun Baru Hijriah, Maulid) bergantung
  hisab/rukyat.
- **Idempoten tanpa constraint baru:** dalam satu transaksi, `delete from holidays where
  extract(year from tanggal) = 2026 and branch_id is null` lalu `insert` seluruh `HOLIDAYS_2026`.
  Aman dijalankan berulang; tidak menyentuh libur per-cabang. (Tidak ada perubahan skema `holidays`
  di Plan 5.)
- Jalankan via `npx tsx scripts/seed-holidays-2026.ts` dengan service-role client (pola
  `scripts/seed.ts`).

### `pengaturan/libur/page.tsx` (hr_admin/super_admin)
- List `holidays` dikelompokkan per tahun (default tahun berjalan), diurut `tanggal`.
- Form tambah: `tanggal` (date), `nama` (text), cakupan (nasional / pilih cabang). Server action
  `addHoliday` / `deleteHoliday` via client user-scoped (RLS `is_hr_admin_role()` menegakkan).
- Konfirmasi inline untuk hapus. Error/empty state pesan tetap.

---

## 8. Migrasi (ringkas)

| # | Isi |
|---|-----|
| `0018_employee_authz_audit_and_holiday_rls.sql` | trigger `prevent_protected_employee_field_change` · trigger `audit_employee_changes` · `holidays_write` → `is_hr_admin_role()` (tidak ada perubahan skema tabel) |
| `0019_audit_leave_approval.sql` | `create or replace` `approve_leave_request` + `reject_leave_request` (body `0016` + insert `audit_logs`), re-grant/revoke |

---

## 9. Testing

### Unit (`npm test`)
- `validateEmployeeInput`: semua field wajib, format email, `designated_approver` wajib untuk
  hr/super, koersi `gajiPokok`, tanggal invalid.
- Filter list `/karyawan` bila diekstrak ke fungsi murni.
- `AuditAksiBadge`: label per aksi, kelas warna berbeda.
- `set-password` form: validasi min 8 + konfirmasi cocok (komponen client, Testing Library).

### Integration (`npm run test:integration`, live cloud)
- `0018` field terproteksi: `atasan` update `gaji_pokok`/`role` karyawan lain → ditolak
  (`not allowed to change protected employee fields`); `hr_admin` → berhasil; `atasan` update
  `no_telp` karyawan lain (jika RLS mengizinkan) → berhasil (bukan field terproteksi).
- `0018` audit: create → 1 baris `employee_created`; update field → `employee_updated`; set
  `status='nonaktif'` → `employee_deactivated`; `is_self_action` benar saat hr_admin mengedit
  dirinya sendiri.
- `0019` audit cuti: approve → baris `leave_approved` dengan `target_employee_id` = pemohon;
  reject → `leave_rejected`. RPC tetap 5/5 seperti sebelumnya (tidak ada regresi).
- `inviteEmployee`: menghasilkan auth user + baris `employees` + `setPasswordUrl` non-kosong;
  rollback menghapus auth user saat insert `employees` gagal.
- Sesi nonaktif: `getCurrentEmployee` return `null` untuk karyawan `status='nonaktif'`.
- Bukti grant: `anon` tak punya execute pada `approve_leave_request`/`reject_leave_request`
  setelah `0019` (tetap).

### Manual QA
Buat karyawan → salin link → buka di jendela incognito → set password → login → edit sebagai
atasan (tertolak untuk field sensitif) → nonaktifkan → konfirmasi tak bisa login → cek
`/pengaturan/audit` mencatat semua langkah.

---

## 10. Urutan Task (estimasi ~14 task)

1. Migrasi `0018` (2 trigger + `holidays_write` → `is_hr_admin_role()`) + integration test trigger field terproteksi.
2. `scripts/seed-holidays-2026.ts` (delete-then-insert idempoten) + jalankan sekali.
3. Integration test audit trigger employees (create/update/deactivate/is_self_action).
4. Migrasi `0019` (retrofit audit RPC cuti) + integration test.
5. `validateEmployeeInput` + test.
6. `inviteEmployee` rework (generateLink + setPasswordUrl) + integration test + rollback test.
7. `getCurrentEmployee` + proxy: tolak `status != 'aktif'` + `CurrentEmployee.status` + test.
8. `/set-password` page + form component + test.
9. route-access `/karyawan` hr_admin + nav filter.
10. `/karyawan` list page (filter cabang/role/status + search) + build.
11. `/karyawan/baru` create form + `createEmployee` action (tampilkan setPasswordUrl) + build.
12. `/karyawan/[id]` detail/edit + `updateEmployee` + nonaktif/aktif + riwayat audit + build.
13. `AuditAksiBadge` + `/pengaturan/audit` viewer (filter tanggal/target/aksi) + build.
14. `/pengaturan/libur` CRUD + build.

---

## 11. Open Items (operasional, bukan blocker kode)

- Daftar libur nasional 2026 di seed HARUS diverifikasi HR terhadap SKB 3 Menteri resmi sebelum
  periode payroll riil pertama — tanggal hari raya Islam bersifat perkiraan.
- Redirect URL `/set-password` harus didaftarkan di allowlist project Supabase (langkah manual,
  didokumentasikan di task 6/8).
- Belum ada UI ganti password mandiri di `/profil` — karyawan yang lupa password minta link baru
  ke HR (HR generate ulang lewat tombol di `/karyawan/[id]`). Tombol "buat ulang link set-password"
  di `/karyawan/[id]` = nice-to-have, boleh masuk Task 12 bila murah.
