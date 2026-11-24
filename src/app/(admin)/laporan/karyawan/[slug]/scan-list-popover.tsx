"use client";

import { Fingerprint } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const JAM = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

/** All machine scans of one day, marking which became jam masuk / pulang. */
export function ScanListPopover({
  scans,
  jamMasuk,
  jamPulang,
  tanggalLabel,
}: {
  scans: string[];
  jamMasuk: string | null;
  jamPulang: string | null;
  tanggalLabel: string;
}) {
  const same = (a: string, b: string | null) => b != null && Date.parse(a) === Date.parse(b);
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className="inline-flex items-center gap-1 rounded text-[0.72rem] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`Lihat ${scans.length} scan mesin, ${tanggalLabel}`}
      >
        <Fingerprint className="size-3" aria-hidden="true" />
        {scans.length} scan
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <p className="mb-2 text-xs font-semibold">Scan mesin · {tanggalLabel}</p>
        <ol className="space-y-1 text-sm">
          {scans.map((s) => {
            const tag = same(s, jamMasuk) ? "Masuk" : same(s, jamPulang) ? "Pulang" : null;
            return (
              <li key={s} className="flex items-center justify-between gap-3">
                <span className={`font-mono tabular-nums ${tag ? "font-semibold" : "text-muted-foreground"}`}>{JAM.format(new Date(s))}</span>
                {tag && <span className="text-xs text-muted-foreground">{tag}</span>}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[0.72rem] text-muted-foreground">Scan yang tidak ditandai tersimpan sebagai log dan tidak mengubah jam absen.</p>
      </PopoverContent>
    </Popover>
  );
}
