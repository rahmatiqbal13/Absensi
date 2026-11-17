# tapabsen

Sistem absensi karyawan + HR: absen GPS/selfie/QR, cuti & approval, payroll dengan PPh21, laporan, dan audit log. Kebutuhan produk ada di [docs/PRD-Sistem-Absensi-HR.md](docs/PRD-Sistem-Absensi-HR.md); desain per modul di [docs/superpowers/specs/](docs/superpowers/specs/).

**Stack:** Next.js 16 (App Router, Server Actions) · Supabase (Postgres + RLS, Auth, Storage, Edge Functions, pg_cron) · Tailwind 4 + shadcn/ui · Vitest · deploy di Vercel.

## Setup lokal

Butuh Node 22+ dan [Supabase CLI](https://supabase.com/docs/guides/cli) (sudah terpasang sebagai devDependency).

```bash
npm install
cp .env.local.example .env.local   # isi nilainya, lihat tabel di bawah
```

### Database

```bash
npx supabase link --project-ref <project-ref>
PURGE_SHARED_SECRET=<secret> npx supabase db push        # jalankan semua migrasi di supabase/migrations
npm run seed                                             # cabang "Kantor Pusat" + 2 super admin
npx tsx scripts/seed-holidays-2026.ts                    # libur nasional 2026 (verifikasi ke SKB 3 Menteri)
```

Hapus foto absensi > 90 hari berjalan lewat Edge Function yang dijadwalkan pg_cron (migrasi `0025`):

```bash
npx supabase functions deploy purge-expired-photos
npx supabase secrets set PURGE_SHARED_SECRET=<secret yang sama>
```

### Jalankan

```bash
npm run dev     # http://localhost:3000
```

Clock-in sengaja dikunci hanya dari perangkat mobile (anti-pemalsuan GPS); fitur lain bisa dari desktop.

## Environment variables

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya | Kredensial project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Hanya di server: undangan karyawan, tulis absensi, payroll |
| `NEXT_PUBLIC_APP_URL` | disarankan | Origin publik untuk link undangan & email. Kosong → domain produksi Vercel, lalu `http://localhost:3000` |
| `SEED_SUPERADMIN_PASSWORD` | untuk seed | Password awal super admin |
| `RESEND_API_KEY`, `EMAIL_FROM` | tidak | Notifikasi email; tanpa ini email dilewati |
| `CRON_SECRET` | produksi | Melindungi `/api/cron/holidays` (sinkron libur nasional mingguan, lihat `vercel.json`) |
| `PURGE_SHARED_SECRET` | produksi | Dibaca saat `supabase db push` dan oleh Edge Function purge |

## Testing

```bash
npm test                   # unit test (cepat, tanpa jaringan)
npm run test:integration   # butuh project Supabase sungguhan + service-role key di .env.local
npm run lint
npx tsc --noEmit
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) menjalankan typecheck, lint, dan unit test di setiap push ke `main` dan setiap pull request. Integration test tidak dijalankan di CI.

## Struktur

```
src/app/(employee)   absen, cuti, riwayat, slip gaji — mobile-first
src/app/(admin)      dashboard, karyawan, persetujuan cuti, laporan, payroll, pengaturan
src/app/(account)    profil
src/app/(auth)       login, set-password (dari link undangan)
src/app/kiosk/[key]  layar QR absensi per cabang
src/lib/             logika domain (attendance, leave, payroll, laporan, ...) + unit test
supabase/migrations  skema, RLS, trigger, RPC
tests/integration    test terhadap Supabase sungguhan (RLS, RPC, storage)
```

Konvensi: ikon pakai `lucide-react`, tanpa emoji. Next.js versi ini punya breaking changes. Baca `node_modules/next/dist/docs/` sebelum menulis kode (lihat [AGENTS.md](AGENTS.md)).
