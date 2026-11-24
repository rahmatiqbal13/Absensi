"use client";

import { useState, useTransition } from "react";
import { LockOpen } from "lucide-react";
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
import type { ActionResult } from "../../actions";

/** Final but not yet paid: HR may return the period to draft (absen terlambat masuk, dll.). */
export function ReopenPayrollButton({ periodLabel, onReopen }: { periodLabel: string; onReopen: () => Promise<ActionResult> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <LockOpen className="size-4" aria-hidden="true" /> Buka kembali payroll
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Buka kembali payroll {periodLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Periode kembali ke draft: slip gaji tidak tampil ke karyawan sampai difinalisasi lagi, dan absensi bulan ini bisa diubah
            kembali. Scan mesin yang tersimpan untuk bulan ini langsung dimasukkan ke absensi. Setelah itu generate ulang slip, periksa,
            lalu finalisasi lagi. Tindakan ini dicatat di audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await onReopen();
                if (!r.ok) return void toast.error(r.error);
                toast.success(r.message ?? "Periode dibuka kembali.");
                setOpen(false);
              });
            }}
          >
            {pending ? "Membuka…" : "Buka kembali"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
