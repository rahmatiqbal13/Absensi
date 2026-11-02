import type { AttendanceSummary } from "@/lib/dashboard/attendance-summary";
import { cn } from "@/lib/utils";

// One exclusive bucket per employee. `hadir` from the summary lib already
// includes pulang_cepat / di_luar_lokasi, so those are peeled off here.
const BUCKETS = [
  { key: "tepat", label: "Tepat waktu", swatch: "bg-primary" },
  { key: "terlambat", label: "Terlambat", swatch: "bg-warning-solid" },
  { key: "pulangCepat", label: "Pulang cepat", swatch: "bg-early-solid" },
  { key: "diLuarLokasi", label: "Di luar lokasi", swatch: "bg-info-solid" },
  { key: "alpa", label: "Alpa / belum absen", swatch: "bg-danger-solid" },
  { key: "cuti", label: "Cuti", swatch: "bg-leave-solid" },
] as const;

type BucketKey = (typeof BUCKETS)[number]["key"];

// Above this many people a dot per person stops being readable; switch to a
// 100-cell grid where each cell is one percent.
const MAX_DOTS = 240;

export function bucketCounts(s: AttendanceSummary): Record<BucketKey, number> {
  return {
    tepat: Math.max(0, s.hadir - s.pulangCepat - s.diLuarLokasi),
    terlambat: s.terlambat,
    pulangCepat: s.pulangCepat,
    diLuarLokasi: s.diLuarLokasi,
    alpa: s.alpa,
    cuti: s.cuti,
  };
}

export function TodayBoard({ summary }: { summary: AttendanceSummary }) {
  const counts = bucketCounts(summary);
  const people = BUCKETS.reduce((n, b) => n + counts[b.key], 0);
  const present = summary.hadir + summary.terlambat;
  const expected = Math.max(0, people - counts.cuti);
  const rate = expected > 0 ? Math.round((present / expected) * 100) : null;

  const perCell = people > MAX_DOTS ? people / 100 : 1;
  const cells = BUCKETS.flatMap((b) =>
    Array.from({ length: Math.round(counts[b.key] / perCell) }, (_, i) => ({ id: `${b.key}-${i}`, swatch: b.swatch })),
  );

  return (
    <section className="grid gap-7 rounded-[18px] border border-border bg-card p-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[1.05rem] font-semibold">Siapa sudah datang</h2>
          <span className="text-sm text-muted-foreground">
            {perCell === 1 ? "Satu kotak = satu karyawan" : "Satu kotak = 1% karyawan"}
          </span>
        </div>
        {/* Decorative; the legend beside it carries the same numbers as text. */}
        <div aria-hidden="true" className="flex flex-wrap gap-1">
          {cells.map((c) => (
            <span key={c.id} className={cn("size-4 rounded-[4px]", c.swatch)} />
          ))}
          {cells.length === 0 && <span className="text-sm text-muted-foreground">Belum ada data hari ini.</span>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4.5 border-border lg:border-l lg:pl-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">Tingkat kehadiran</span>
          <span className="text-[4rem] leading-none font-semibold tracking-[-0.05em] tabular-nums">
            {rate == null ? "—" : `${rate}%`}
          </span>
          <span className="text-sm text-muted-foreground">
            {present} dari {expected} yang dijadwalkan · {counts.cuti} cuti
          </span>
        </div>
        <ul className="flex flex-col">
          {BUCKETS.map((b) => (
            <li key={b.key} className="flex min-h-[34px] items-center gap-2.5 border-t border-hairline text-sm">
              <span aria-hidden="true" className={cn("size-3 rounded-[3px]", b.swatch)} />
              <span className="flex-1">{b.label}</span>
              <span className="font-mono font-semibold tabular-nums">{counts[b.key]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function BranchBars({
  rows,
}: {
  rows: { branchId: string; nama: string; hadir: number; terlambat: number; alpa: number }[];
}) {
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => {
        const total = r.hadir + r.terlambat + r.alpa;
        const w = (n: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");
        return (
          <li key={r.branchId} className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-semibold">{r.nama}</span>
              <span className="font-mono text-muted-foreground">
                {r.hadir} hadir · {r.terlambat} terlambat · {r.alpa} alpa
              </span>
            </div>
            <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-[4px] bg-secondary">
              <span className="bg-primary" style={{ width: w(r.hadir) }} />
              <span className="bg-warning-solid" style={{ width: w(r.terlambat) }} />
              <span className="bg-danger-solid" style={{ width: w(r.alpa) }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
