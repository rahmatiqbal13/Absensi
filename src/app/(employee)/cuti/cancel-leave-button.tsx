"use client";

import { useState, useTransition } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Result = { ok: true } | { ok: false; error: string };

export function CancelLeaveButton({
  action,
  approved,
  refundsBalance,
}: {
  action: () => Promise<Result>;
  /** Already approved: cancelling also frees the dates (and balance). */
  approved: boolean;
  /** Annual leave: the days go back to the balance. */
  refundsBalance: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm(e: React.MouseEvent) {
    e.preventDefault(); // keep the dialog open until the action resolves
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        setOpen(false);
        toast.success("Pengajuan cuti dibatalkan.");
      } else {
        toast.error(r.error);
      }
    });
  }

  const description = approved
    ? `Cuti ini sudah disetujui. Setelah dibatalkan Anda dijadwalkan masuk kerja seperti biasa pada tanggal tersebut${
        refundsBalance ? ", dan saldo cuti tahunan dikembalikan" : ""
      }.`
    : "Pengajuan akan ditarik dan tidak lagi muncul di daftar persetujuan atasan.";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="self-start text-destructive hover:bg-destructive/10">
          <Ban className="size-4" aria-hidden="true" /> Batalkan pengajuan
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Batalkan pengajuan cuti?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Kembali</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? "Membatalkan…" : "Ya, batalkan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
