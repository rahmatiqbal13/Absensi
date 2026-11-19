import { cn } from "@/lib/utils";
import type { AttendanceRecord } from "./history-list";

const WEEK_HEAD = ["S", "S", "R", "K", "J", "S", "M"]; // Senin .. Minggu
const WEEK_HEAD_FULL = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

/**
 * Status -> cell colour and a letter, so the calendar never relies on colour
 * alone. Solid fills; dark mode solids are light, hence the dark text there.
 */
const LEGEND = {
  tepat_waktu: { label: "Tepat waktu", glyph: "H", cell: "bg-success-solid text-primary-foreground" },
  terlambat: { label: "Terlambat", glyph: "T", cell: "bg-warning-solid text-highlight-foreground" },
  pulang_cepat: { label: "Pulang cepat", glyph: "P", cell: "bg-early-solid text-highlight-foreground" },
  di_luar_lokasi: { label: "Di luar lokasi", glyph: "L", cell: "bg-info-solid text-highlight-foreground" },
  alpa: { label: "Tidak absen", glyph: "A", cell: "bg-danger-solid text-primary-foreground" },
  cuti: { label: "Cuti", glyph: "C", cell: "bg-leave-solid text-primary-foreground" },
} as const;

type LegendKey = keyof typeof LEGEND;

function keyOf(r: AttendanceRecord): LegendKey | "libur" {
  if (r.kind === "alpa") return "alpa";
  if (r.kind === "cuti") return "cuti";
  if (r.kind === "libur") return "libur";
  return r.status in LEGEND ? (r.status as LegendKey) : "tepat_waktu";
}

/**
 * The month as a Monday-first grid. Days with a record are tappable via
 * `wrapDay` (the same detail sheet as the list); weekends, future days and
 * days before joining stay plain.
 */
export function MonthCalendar({
  ym,
  today,
  records,
  wrapDay,
}: {
  /** "2026-10" */
  ym: string;
  today: string;
  records: AttendanceRecord[];
  /** Wrap a cell in its detail sheet; return null to leave it static. */
  wrapDay: (record: AttendanceRecord, cell: React.ReactNode, trigger: { className: string; label: string }) => React.ReactNode | null;
}) {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const byDate = new Map(records.map((r) => [r.tanggal, r]));

  const counts: Partial<Record<LegendKey, number>> = {};
  for (const r of records) {
    const k = keyOf(r);
    if (k !== "libur") counts[k] = (counts[k] ?? 0) + 1;
  }

  const base =
    "relative grid aspect-square w-full place-items-center rounded-[9px] font-mono text-[0.8rem] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <section aria-label="Kalender bulan ini" className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_HEAD.map((w, i) => (
          <abbr key={i} title={WEEK_HEAD_FULL[i]} className="pb-1 text-center font-mono text-[0.7rem] text-muted-foreground no-underline">
            {w}
          </abbr>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const tanggal = `${ym}-${String(d).padStart(2, "0")}`;
          const rec = byDate.get(tanggal);
          const isToday = tanggal === today;
          const ring = isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";
          if (!rec) {
            return (
              <span
                key={tanggal}
                className={cn(base, "font-medium", tanggal > today ? "text-muted-foreground/60" : "text-muted-foreground", ring)}
              >
                {d}
              </span>
            );
          }
          const k = keyOf(rec);
          const legend = k === "libur" ? null : LEGEND[k];
          const cell = (
            <>
              {d}
              {legend && (
                <span aria-hidden="true" className="absolute right-1 bottom-0.5 text-[0.55rem] leading-none font-bold opacity-85">
                  {legend.glyph}
                </span>
              )}
            </>
          );
          const className = cn(
            base,
            legend ? legend.cell : "border border-dashed border-input text-muted-foreground",
            ring,
          );
          const label = `${d} ${legend?.label ?? rec.keterangan ?? "Libur"}`;
          const wrapped = wrapDay(rec, cell, { className, label });
          return (
            <span key={tanggal} className="contents">
              {wrapped ?? (
                <span className={className} aria-label={label}>
                  {cell}
                </span>
              )}
            </span>
          );
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Keterangan dan jumlah">
        {(Object.keys(LEGEND) as LegendKey[]).map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn("grid size-[18px] place-items-center rounded-[5px] font-mono text-[0.6rem] font-bold", LEGEND[k].cell)}
            >
              {LEGEND[k].glyph}
            </span>
            {LEGEND[k].label}
            <b className="font-mono text-foreground tabular-nums">{counts[k] ?? 0}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
