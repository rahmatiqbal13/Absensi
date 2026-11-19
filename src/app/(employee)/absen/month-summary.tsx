import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentEmployee } from "@/lib/auth/session";
import { loadEmployeeDailyReport } from "@/lib/laporan/load-employee-daily";
import { summarizeDaily } from "@/lib/laporan/employee-daily";
import { getLeaveBalance } from "@/lib/leave/balance-lookup";
import { isMagang } from "@/lib/employees/contracts";
import { cn } from "@/lib/utils";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

type Chip = { glyph: string; text: string; tone: string; swatch: string };

/**
 * This month at a glance under the clock panel: on time, late, missed and
 * annual leave left, linking to Riwayat. Same day rules as Riwayat (today only
 * counts once there is a clock-in), so the numbers match that page.
 */
export async function MonthSummary({
  db,
  employee,
  today,
}: {
  db: SupabaseClient;
  employee: CurrentEmployee;
  today: string;
}) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const magang = isMagang(employee.statusKontrak);
  const [report, balance] = await Promise.all([
    loadEmployeeDailyReport(db, employee, employee.id, monthStart, today),
    magang ? Promise.resolve(null) : getLeaveBalance(db, employee.id, Number(today.slice(0, 4)), { magang }),
  ]);
  if (!report.ok) {
    console.error("MonthSummary: daily report failed", report.error);
    return null;
  }

  const s = summarizeDaily(report.report.rows.filter((r) => r.tanggal < today || r.kind === "hadir"));
  const chips: Chip[] = [
    { glyph: "H", text: `${s.tepatWaktu} tepat`, tone: "bg-success text-success-foreground", swatch: "bg-success-solid" },
    { glyph: "T", text: `${s.terlambat}× telat`, tone: "bg-warning text-warning-foreground", swatch: "bg-warning-solid" },
  ];
  if (s.alpa > 0) {
    chips.push({ glyph: "A", text: `${s.alpa} tidak absen`, tone: "bg-danger text-danger-foreground", swatch: "bg-danger-solid" });
  }
  if (balance?.ok) {
    const sisa = balance.balance.sisa;
    chips.push({
      glyph: "C",
      text: `cuti ${Number.isInteger(sisa) ? sisa : sisa.toFixed(1)}/${balance.balance.awal}`,
      tone: "bg-leave text-leave-foreground",
      swatch: "bg-leave-solid",
    });
  }

  const month = MONTH_SHORT[Number(today.slice(5, 7)) - 1];
  return (
    <Link
      href="/riwayat"
      className="flex min-h-11 items-center gap-2 border-t border-border pt-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-mono text-[0.7rem] tracking-[0.08em] text-muted-foreground uppercase">
        <span className="sr-only">Ringkasan bulan </span>
        {month}
      </span>
      <span className="flex flex-1 flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.glyph}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-full pr-2.5 pl-1.5 text-[0.78rem] font-semibold", c.tone)}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-[18px] place-items-center rounded-[5px] font-mono text-[0.65rem] font-bold text-primary-foreground",
                c.swatch,
                (c.glyph === "T") && "text-highlight-foreground",
              )}
            >
              {c.glyph}
            </span>
            {c.text}
          </span>
        ))}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Buka riwayat</span>
    </Link>
  );
}

export function MonthSummarySkeleton() {
  return <div aria-hidden="true" className="h-11 animate-pulse rounded-lg border-t border-border bg-muted/50" />;
}
