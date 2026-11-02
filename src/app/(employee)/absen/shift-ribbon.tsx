"use client";

import { jakartaClock, useNow } from "@/lib/time/use-now";

// The ribbon spans 06:00–20:00 WIB.
const START = 6 * 60;
const SPAN = 14 * 60;

const pct = (minutes: number) => `${Math.max(0, Math.min(100, ((minutes - START) / SPAN) * 100))}%`;
const widthPct = (from: number, to: number) => `${Math.max(0, (Math.min(to, START + SPAN) - Math.max(from, START)) / SPAN) * 100}%`;

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const isoMinutes = (iso: string) => jakartaClock(new Date(iso)).minutesOfDay;

/**
 * Today's shift as a horizontal band: scheduled hours in ink, the late
 * tolerance as a brand stripe, the worked span in green and a "now" marker.
 * Decorative — the same facts are spelled out in the caption under it.
 */
export function ShiftRibbon({
  jamMasuk,
  jamPulang,
  toleransiMenit,
  clockIn,
  clockOut,
}: {
  jamMasuk: string;
  jamPulang: string | null;
  toleransiMenit: number;
  clockIn: string | null;
  clockOut: string | null;
}) {
  const now = useNow(30_000);
  const start = hhmmToMinutes(jamMasuk);
  const end = jamPulang ? hhmmToMinutes(jamPulang) : start + 8 * 60;
  const nowMin = now ? jakartaClock(now).minutesOfDay : null;
  const workedFrom = clockIn ? isoMinutes(clockIn) : null;
  const workedTo = clockOut ? isoMinutes(clockOut) : nowMin;

  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden="true" className="relative h-9 overflow-hidden rounded-lg bg-secondary">
        <div className="absolute inset-y-0 bg-primary" style={{ left: pct(start), width: widthPct(start, end) }} />
        <div
          className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--brand)_0_3px,color-mix(in_oklch,var(--brand),white_18%)_3px_6px)]"
          style={{ left: pct(start), width: widthPct(start, start + toleransiMenit) }}
        />
        {workedFrom != null && workedTo != null && (
          <div
            className="absolute inset-y-0 bg-success-solid"
            style={{ left: pct(workedFrom), width: widthPct(workedFrom, Math.max(workedTo, workedFrom + 5)) }}
          />
        )}
        {nowMin != null && (
          <div
            className="absolute -inset-y-0.5 -ml-px w-[3px] bg-brand shadow-[0_0_0_2px_var(--background)]"
            style={{ left: pct(nowMin) }}
          />
        )}
      </div>
      <div className="flex justify-between font-mono text-[0.7rem] text-muted-foreground">
        <span>06</span>
        <span className="font-semibold text-foreground">
          {jamMasuk} masuk · toleransi {toleransiMenit} mnt
        </span>
        {jamPulang && <span className="font-semibold text-foreground">{jamPulang}</span>}
        <span>20</span>
      </div>
    </div>
  );
}
