"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGAMA_OPTIONS,
  JENIS_KELAMIN_LABEL,
  PENDIDIKAN_OPTIONS,
  formatNomorPegawai,
  type PersonalData,
} from "@/lib/employees/personal-data";

type Result = { ok: true; nomorPegawai: string | null; nomorBaru: boolean } | { ok: false; error: string };

export function PersonalDataForm({
  defaults,
  nomorPegawai,
  save,
}: {
  defaults: PersonalData;
  nomorPegawai: string | null;
  save: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await save(fd);
          if (!r.ok) return setError(r.error);
          toast.success(
            r.nomorBaru && r.nomorPegawai
              ? `Data diri tersimpan. Nomor pegawai Anda: ${formatNomorPegawai(r.nomorPegawai)}`
              : "Data diri tersimpan.",
          );
        });
      }}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Data diri</h2>
        <p className="text-sm text-muted-foreground">
          {nomorPegawai ? (
            <>
              Nomor pegawai: <span className="font-mono font-semibold text-foreground">{formatNomorPegawai(nomorPegawai)}</span>
            </>
          ) : (
            "Nomor pegawai dibuat otomatis setelah tanggal lahir disimpan, lalu tidak berubah lagi."
          )}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tempat_lahir" label="Tempat lahir">
          <Input name="tempat_lahir" defaultValue={defaults.tempat_lahir ?? ""} maxLength={100} />
        </Field>
        <Field id="tanggal_lahir" label="Tanggal lahir" hint={nomorPegawai ? "Salah tanggal? Minta HR membetulkannya." : undefined}>
          <Input name="tanggal_lahir" type="date" defaultValue={defaults.tanggal_lahir ?? ""} min="1930-01-01" />
        </Field>
        <Field id="jenis_kelamin" label="Jenis kelamin">
          <NativeSelect name="jenis_kelamin" defaultValue={defaults.jenis_kelamin ?? ""}>
            <option value="">—</option>
            {Object.entries(JENIS_KELAMIN_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="agama" label="Agama">
          <NativeSelect name="agama" defaultValue={defaults.agama ?? ""}>
            <option value="">—</option>
            {AGAMA_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="pendidikan_terakhir" label="Pendidikan terakhir">
          <NativeSelect name="pendidikan_terakhir" defaultValue={defaults.pendidikan_terakhir ?? ""}>
            <option value="">—</option>
            {PENDIDIKAN_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field id="alamat_ktp" label="Alamat sesuai KTP">
        <Textarea name="alamat_ktp" defaultValue={defaults.alamat_ktp ?? ""} maxLength={300} className="min-h-16" />
      </Field>
      <Field id="alamat_domisili" label="Alamat domisili" hint="Kosongkan bila sama dengan alamat KTP.">
        <Textarea name="alamat_domisili" defaultValue={defaults.alamat_domisili ?? ""} maxLength={300} className="min-h-16" />
      </Field>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan data diri"}
      </Button>
    </form>
  );
}
