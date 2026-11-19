"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AttendanceCorrectionDialog, type CorrectionDefaults } from "@/components/attendance-correction-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Result = { ok: true } | { ok: false; error: string };

/**
 * One Riwayat row as a button: tapping it opens the day's detail, and
 * "Ajukan koreksi" lives there instead of on every row.
 */
export function DayDetailSheet({
  children,
  title,
  jamMasuk,
  jamPulang,
  badge,
  catatan,
  info,
  tag,
  correction,
}: {
  children: React.ReactNode;
  title: string;
  jamMasuk: string;
  jamPulang: string;
  badge: React.ReactNode;
  catatan: string | null;
  /** Extra line, e.g. recorded lembur. */
  info?: string;
  tag?: "pending" | "approved";
  /** Present when the day is still inside the correction window. */
  correction?: { action: (fd: FormData) => Promise<Result>; defaults: CorrectionDefaults; minDate: string; maxDate: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span className="min-w-0 flex-1">{children}</span>
          <ChevronRight className="mr-3 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Detail absensi hari ini</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Jam masuk</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">{jamMasuk}</dd>
            </div>
            <div className="rounded-xl bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Jam pulang</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">{jamPulang}</dd>
            </div>
          </dl>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            {badge}
          </div>
          {info && <p className="text-sm text-foreground">{info}</p>}
          {catatan && <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">{catatan}</p>}

          {tag === "pending" ? (
            <p className="rounded-lg bg-warning px-3 py-2.5 text-sm text-warning-foreground">
              Koreksi untuk hari ini sedang menunggu persetujuan atasan.{" "}
              <Link href="/pengajuan/koreksi" className="font-semibold underline underline-offset-2">
                Lihat pengajuan
              </Link>
            </p>
          ) : (
            <>
              {tag === "approved" && (
                <p className="text-sm text-muted-foreground">Absensi hari ini sudah dikoreksi dan disetujui atasan.</p>
              )}
              {correction ? (
                <AttendanceCorrectionDialog
                  {...correction}
                  trigger="primary"
                  title="Ajukan koreksi absensi"
                  description="Isi jam masuk dan pulang yang sebenarnya. Atasan Anda akan meninjau, dan absensi diperbarui setelah disetujui."
                  submitLabel="Kirim pengajuan"
                  successMessage="Pengajuan koreksi terkirim ke atasan Anda."
                  onDone={() => setOpen(false)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Koreksi hanya bisa diajukan untuk 31 hari terakhir.</p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
