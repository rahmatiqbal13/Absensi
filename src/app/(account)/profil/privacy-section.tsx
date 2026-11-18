"use client";

import { useState, useTransition } from "react";
import { Download, ShieldOff } from "lucide-react";
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

/** UU PDP self-service: download own data, withdraw location/photo consent. */
export function PrivacySection({
  consentActive,
  withdraw,
}: {
  consentActive: boolean;
  withdraw: () => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="privasi-heading" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 id="privasi-heading" className="text-base font-semibold">
        Privasi data
      </h2>
      <p className="text-sm text-muted-foreground">
        Sesuai UU Pelindungan Data Pribadi, Anda bisa mengunduh salinan data Anda dan menarik persetujuan pemrosesan
        lokasi &amp; foto. Foto absensi dihapus otomatis setelah 90 hari.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href="/profil/data-saya">
            <Download className="size-4" aria-hidden="true" /> Unduh data saya
          </a>
        </Button>
        {consentActive ? (
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                <ShieldOff className="size-4" aria-hidden="true" /> Tarik persetujuan lokasi &amp; foto
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tarik persetujuan?</AlertDialogTitle>
                <AlertDialogDescription>
                  Absen lewat aplikasi membutuhkan lokasi dan foto. Setelah persetujuan ditarik, Anda tidak bisa absen
                  sampai menyetujuinya lagi; hubungi HR untuk cara absen lain. Data yang sudah ada tetap tersimpan
                  sesuai masa simpannya.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    startTransition(async () => {
                      const r = await withdraw();
                      if (r.ok) {
                        toast.success("Persetujuan ditarik.");
                        setOpen(false);
                      } else toast.error(r.error);
                    });
                  }}
                >
                  {pending ? "Memproses…" : "Ya, tarik"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span className="self-center text-sm text-muted-foreground">Persetujuan lokasi &amp; foto: belum diberikan.</span>
        )}
      </div>
    </section>
  );
}
