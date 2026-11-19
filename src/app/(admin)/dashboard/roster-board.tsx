"use client";

import type { KeyboardEvent } from "react";
import type { RosterBranch, RosterBucket, RosterPerson } from "@/lib/dashboard/today-roster";
import { BUCKET_STYLE } from "@/lib/dashboard/bucket-style";
import { cn } from "@/lib/utils";

const HM = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});

export function personLine(p: RosterPerson): string {
  if (p.bucket === "cuti") return "Cuti disetujui";
  if (p.bucket === "alpa") return p.belumAbsen ? "Belum absen" : "Alpa · tanpa keterangan";
  const jam = p.jamMasuk ? `Masuk ${HM.format(new Date(p.jamMasuk)).replace(".", ":")}` : "Sudah absen";
  const note =
    p.bucket === "terlambat"
      ? "terlambat"
      : p.bucket === "diLuarLokasi"
        ? "di luar radius kantor"
        : p.bucket === "pulangCepat"
          ? "pulang lebih awal"
          : "tepat waktu";
  return `${jam} · ${note}`;
}

/** Arrow keys move between people in reading order; one tab stop per group. */
function onGroupKey(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
  const i = btns.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  const top = btns[0].offsetTop;
  const firstBreak = btns.findIndex((b) => b.offsetTop > top);
  const perRow = firstBreak === -1 ? btns.length : firstBreak;
  let n = i;
  if (e.key === "ArrowRight") n = i + 1;
  else if (e.key === "ArrowLeft") n = i - 1;
  else if (e.key === "ArrowDown") n = i + perRow;
  else if (e.key === "ArrowUp") n = i - perRow;
  else if (e.key === "Home") n = 0;
  else n = btns.length - 1;
  n = Math.max(0, Math.min(btns.length - 1, n));
  e.preventDefault();
  btns[i].tabIndex = -1;
  btns[n].tabIndex = 0;
  btns[n].focus();
}

const PRESENT: RosterBucket[] = ["tepat", "terlambat", "pulangCepat", "diLuarLokasi"];

export function RosterGroups({ branches }: { branches: RosterBranch[] }) {
  if (branches.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada karyawan yang dijadwalkan hari ini.</p>;
  }
  return (
    <div className="flex flex-col gap-5.5">
      {branches.map((g) => {
        const present = g.people.filter((p) => PRESENT.includes(p.bucket)).length;
        const expected = g.people.filter((p) => p.bucket !== "cuti").length;
        const summary = `${present} dari ${expected} hadir`;
        return (
          <div key={g.branchId} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-sm font-semibold">{g.nama}</span>
              <span className="text-[0.8rem] text-muted-foreground">{summary}</span>
            </div>
            <div
              role="group"
              aria-label={`${g.nama}: ${summary}. Gunakan tombol panah untuk berpindah antar karyawan.`}
              onKeyDown={onGroupKey}
              className="flex flex-wrap gap-1.5"
            >
              {g.people.map((p, i) => {
                const s = BUCKET_STYLE[p.bucket];
                const line = personLine(p);
                return (
                  <button
                    key={p.employeeId}
                    type="button"
                    tabIndex={i === 0 ? 0 : -1}
                    aria-label={`${p.nama}, ${g.nama}: ${line}`}
                    className={cn(
                      "group relative grid size-[22px] cursor-default place-items-center rounded-[6px] font-mono text-[11px] leading-none font-bold outline-none transition-shadow duration-100",
                      "hover:z-10 hover:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)] focus-visible:z-10 focus-visible:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)]",
                      s.swatch,
                      s.fg,
                    )}
                  >
                    <span aria-hidden="true">{s.glyph}</span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-[calc(100%+12px)] left-1/2 z-20 hidden -translate-x-1/2 flex-col gap-0.5 rounded-[10px] bg-foreground px-3 py-2 text-left font-sans text-[12.5px] leading-snug font-normal whitespace-nowrap text-background shadow-[0_10px_24px_-8px_rgba(12,26,23,.45)] group-hover:flex group-focus-visible:flex"
                    >
                      <span className="text-[13px] font-semibold">{p.nama}</span>
                      <span className="text-background/80">{line}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
