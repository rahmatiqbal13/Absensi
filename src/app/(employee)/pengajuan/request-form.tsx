"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { WorkRequestJenis } from "@/lib/requests/work-requests";

type Result = { ok: true } | { ok: false; error: string };

export function RequestForm({
  jenis,
  today,
  defaultJamMulai,
  submit,
}: {
  jenis: WorkRequestJenis;
  today: string;
  /** The schedule's jam pulang, a sensible start for lembur. */
  defaultJamMulai: string;
  submit: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      action={(fd) => {
        setError(null);
        fd.set("jenis", jenis);
        startTransition(async () => {
          const r = await submit(fd);
          if (r.ok) {
            toast.success("Pengajuan terkirim ke atasan Anda.");
            form.current?.reset();
          } else setError(r.error);
        });
      }}
    >
      {jenis === "lembur" ? (
        <>
          <Field id="tanggal" label="Tanggal" required>
            <Input name="tanggal" type="date" defaultValue={today} required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="jam_mulai" label="Jam mulai" required>
              <Input name="jam_mulai" type="time" defaultValue={defaultJamMulai} required />
            </Field>
            <Field id="jam_selesai" label="Jam selesai" required>
              <Input name="jam_selesai" type="time" required />
            </Field>
          </div>
          <Field id="alasan" label="Pekerjaan yang dilemburkan" required>
            <Textarea name="alasan" maxLength={1000} required className="min-h-20" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Yang dibayar hanya lembur yang disetujui, sebatas jam pulang Anda yang tercatat.
          </p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field id="tanggal_mulai" label="Mulai" required>
              <Input name="tanggal_mulai" type="date" defaultValue={today} required />
            </Field>
            <Field id="tanggal_selesai" label="Selesai" required>
              <Input name="tanggal_selesai" type="date" defaultValue={today} required />
            </Field>
          </div>
          <Field id="tujuan" label="Tujuan / lokasi" required>
            <Input name="tujuan" maxLength={200} required placeholder="Contoh: Kampus Unesa Lidah Wetan" />
          </Field>
          <Field id="alasan" label="Keperluan" required>
            <Textarea name="alasan" maxLength={1000} required className="min-h-20" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Setelah disetujui, Anda tetap absen (selfie + lokasi) tetapi dari mana saja, tanpa perlu alasan.
          </p>
        </>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Mengirim…" : "Kirim pengajuan"}
      </Button>
    </form>
  );
}

export function CancelRequestButton({ cancel }: { cancel: () => Promise<Result> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-destructive hover:bg-destructive/10"
      onClick={() =>
        startTransition(async () => {
          const r = await cancel();
          if (r.ok) toast.success("Pengajuan dibatalkan.");
          else toast.error(r.error);
        })
      }
    >
      {pending ? "Membatalkan…" : "Batalkan"}
    </Button>
  );
}
