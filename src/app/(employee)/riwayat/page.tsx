import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { monthLabel } from "@/lib/format/month";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HistoryList, type AttendanceRecord } from "./history-list";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export default async function RiwayatPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const { bulan } = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  // One month at a time (PRD: riwayat harian/bulanan). Default: this month (WIB).
  const thisMonth = toJakartaDateOnly(new Date()).slice(0, 7);
  const ym = bulan && MONTH_RE.test(bulan) && bulan <= thisMonth ? bulan : thisMonth;
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const { data, error } = await db
    .from("attendances")
    .select("tanggal, jam_masuk, jam_pulang, status, catatan")
    .eq("employee_id", employee.id)
    .gte("tanggal", `${ym}-01`)
    .lte("tanggal", `${ym}-${String(lastDay).padStart(2, "0")}`)
    .order("tanggal", { ascending: false });
  if (error) console.error("RiwayatPage: attendances query failed", error);

  const records: AttendanceRecord[] = (data ?? []).map((row) => ({
    tanggal: row.tanggal,
    jamMasuk: row.jam_masuk,
    jamPulang: row.jam_pulang,
    status: row.status,
    catatan: row.catatan,
  }));
  const count = (s: string) => records.filter((r) => r.status === s).length;
  const prev = shiftMonth(ym, -1);
  const next = shiftMonth(ym, 1);
  const navClass =
    "grid size-11 place-items-center rounded-full ring-1 ring-border text-foreground hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pt-8">
      <h1 className="text-2xl font-semibold text-foreground">Riwayat Absensi</h1>

      <nav aria-label="Pilih bulan" className="flex items-center justify-between gap-3">
        <Link href={`/riwayat?bulan=${prev}`} aria-label={`Bulan sebelumnya, ${monthLabel(Number(prev.slice(5)))}`} className={navClass}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <span className="text-base font-semibold" aria-live="polite">
          {monthLabel(m)} {y}
        </span>
        {next <= thisMonth ? (
          <Link href={`/riwayat?bulan=${next}`} aria-label={`Bulan berikutnya, ${monthLabel(Number(next.slice(5)))}`} className={navClass}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
      </nav>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat riwayat. Muat ulang halaman.</AlertDescription>
        </Alert>
      ) : (
        <>
          {records.length > 0 && (
            <dl className="grid grid-cols-4 gap-2 text-center">
              {[
                ["Tepat", count("tepat_waktu")],
                ["Terlambat", count("terlambat")],
                ["Pulang cepat", count("pulang_cepat")],
                ["Luar lokasi", count("di_luar_lokasi")],
              ].map(([label, n]) => (
                <div key={label} className="flex flex-col-reverse rounded-xl bg-card p-2 ring-1 ring-border">
                  <dt className="text-[0.7rem] text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          )}
          <HistoryList records={records} />
        </>
      )}
    </main>
  );
}
