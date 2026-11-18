"use client";

import { useState, useTransition } from "react";
import { CalendarCog } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { JENIS_KELAMIN_LABEL, formatNomorPegawai, type PersonalData } from "@/lib/employees/personal-data";
import { formatTanggal } from "@/lib/employees/contracts";

type Result = { ok: true } | { ok: false; error: string };

/** HR view of the data diri the employee filled in, plus the birth-date fix. */
export function PersonalDataCard({
  data,
  nomorPegawai,
  correctBirthDate,
}: {
  data: PersonalData;
  nomorPegawai: string | null;
  correctBirthDate: (fd: FormData) => Promise<Result>;
}) {
  const rows: [string, string][] = [
    ["Nomor pegawai", formatNomorPegawai(nomorPegawai) ?? "Belum ada (menunggu tanggal lahir)"],
    ["Tempat, tanggal lahir", [data.tempat_lahir, data.tanggal_lahir ? formatTanggal(data.tanggal_lahir) : null].filter(Boolean).join(", ") || "—"],
    ["Jenis kelamin", data.jenis_kelamin ? JENIS_KELAMIN_LABEL[data.jenis_kelamin] : "—"],
    ["Agama", data.agama ?? "—"],
    ["Pendidikan terakhir", data.pendidikan_terakhir ?? "—"],
    ["Alamat KTP", data.alamat_ktp ?? "—"],
    ["Alamat domisili", data.alamat_domisili ?? (data.alamat_ktp ? "Sama dengan KTP" : "—")],
  ];
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Data diri</h2>
            <p className="text-sm text-muted-foreground">Diisi karyawan sendiri di menu Profil.</p>
          </div>
          <BirthDateDialog current={data.tanggal_lahir} action={correctBirthDate} />
        </div>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className={k === "Nomor pegawai" && nomorPegawai ? "font-mono font-semibold" : ""}>{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function BirthDateDialog({ current, action }: { current: string | null; action: (fd: FormData) => Promise<Result> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarCog className="size-4" aria-hidden="true" /> Koreksi tanggal lahir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Koreksi tanggal lahir</DialogTitle>
          <DialogDescription>
            Nomor pegawai dibuat ulang dari tanggal yang benar. Perubahan tercatat di audit log.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          action={(fd) =>
            startTransition(async () => {
              const r = await action(fd);
              if (r.ok) {
                toast.success("Tanggal lahir dan nomor pegawai diperbarui.");
                setOpen(false);
              } else setError(r.error);
            })
          }
        >
          <Field id="tanggal_lahir_hr" label="Tanggal lahir" required>
            <Input name="tanggal_lahir" type="date" defaultValue={current ?? ""} min="1930-01-01" required />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
