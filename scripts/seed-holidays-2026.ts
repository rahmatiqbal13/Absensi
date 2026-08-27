// scripts/seed-holidays-2026.ts
import { config } from "dotenv";
import { createServiceRoleSupabaseClient } from "../src/lib/supabase/server";

if (require.main === module) {
  config({ path: ".env.local" });
}

// Best-effort Indonesian national holidays for 2026 (branch_id = null = nasional).
// !! HR MUST verify these against the official 2026 SKB 3 Menteri before the
// first real payroll period — the Islamic-calendar dates (Isra Mikraj, Idul
// Fitri, Idul Adha, Tahun Baru Hijriah, Maulid) depend on hisab/rukyat and
// commonly shift by a day.
const HOLIDAYS_2026: { tanggal: string; nama: string }[] = [
  { tanggal: "2026-01-01", nama: "Tahun Baru Masehi" },
  { tanggal: "2026-01-16", nama: "Isra Mikraj Nabi Muhammad SAW" },
  { tanggal: "2026-02-17", nama: "Tahun Baru Imlek 2577" },
  { tanggal: "2026-03-19", nama: "Hari Suci Nyepi (Tahun Baru Saka 1948)" },
  { tanggal: "2026-03-20", nama: "Idul Fitri 1447 H" },
  { tanggal: "2026-03-21", nama: "Idul Fitri 1447 H" },
  { tanggal: "2026-04-03", nama: "Wafat Isa Al Masih" },
  { tanggal: "2026-05-01", nama: "Hari Buruh Internasional" },
  { tanggal: "2026-05-14", nama: "Kenaikan Isa Al Masih" },
  { tanggal: "2026-05-27", nama: "Idul Adha 1447 H" },
  { tanggal: "2026-05-31", nama: "Hari Raya Waisak 2570" },
  { tanggal: "2026-06-01", nama: "Hari Lahir Pancasila" },
  { tanggal: "2026-06-16", nama: "Tahun Baru Islam 1448 H" },
  { tanggal: "2026-08-17", nama: "Hari Kemerdekaan Republik Indonesia" },
  { tanggal: "2026-08-25", nama: "Maulid Nabi Muhammad SAW" },
  { tanggal: "2026-12-25", nama: "Hari Raya Natal" },
];

export async function seedHolidays2026() {
  const db = createServiceRoleSupabaseClient();
  // Idempotent: clear this year's national rows, then reinsert. Per-branch
  // holidays (branch_id not null) are untouched.
  const { error: delErr } = await db
    .from("holidays")
    .delete()
    .is("branch_id", null)
    .gte("tanggal", "2026-01-01")
    .lte("tanggal", "2026-12-31");
  if (delErr) throw new Error(`clear 2026 holidays failed: ${delErr.message}`);

  const { error: insErr } = await db
    .from("holidays")
    .insert(HOLIDAYS_2026.map((h) => ({ ...h, branch_id: null })));
  if (insErr) throw new Error(`insert 2026 holidays failed: ${insErr.message}`);

  return HOLIDAYS_2026.length;
}

if (require.main === module) {
  seedHolidays2026()
    .then((n) => {
      console.log(`Seeded ${n} national holidays for 2026.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
