"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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

const FIELDS = [
  "tempat_lahir",
  "tanggal_lahir",
  "jenis_kelamin",
  "agama",
  "pendidikan_terakhir",
  "alamat_ktp",
  "alamat_domisili",
] as const;

function formatTanggal(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The saved values as read-only rows; "Belum diisi" for blanks. */
function ReadOnly({ data }: { data: PersonalData }) {
  const v = (x: string | null | undefined) => (x && x.trim() ? x : null);
  const rows: [string, string | null][] = [
    ["Tempat lahir", v(data.tempat_lahir)],
    ["Tanggal lahir", data.tanggal_lahir ? formatTanggal(data.tanggal_lahir) : null],
    ["Jenis kelamin", data.jenis_kelamin ? JENIS_KELAMIN_LABEL[data.jenis_kelamin] : null],
    ["Agama", v(data.agama)],
    ["Pendidikan terakhir", v(data.pendidikan_terakhir)],
    ["Alamat sesuai KTP", v(data.alamat_ktp)],
    ["Alamat domisili", v(data.alamat_domisili) ?? (v(data.alamat_ktp) ? "Sama dengan alamat KTP" : null)],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
      {rows.map(([k, val]) => (
        <div key={k} className={k.startsWith("Alamat") ? "sm:col-span-2" : undefined}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className={val ? "break-words whitespace-pre-line text-foreground" : "text-muted-foreground italic"}>
            {val ?? "Belum diisi"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

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
  // Read-only until "Ubah": a stray tap can't change the record. `saved` holds
  // what was last stored, so the view (and a Batal) shows the latest values.
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<PersonalData>(defaults);
  const [nomor, setNomor] = useState(nomorPegawai);

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Data diri</h2>
        <p className="text-sm text-muted-foreground">
          {nomor ? (
            <>
              Nomor pegawai: <span className="font-mono font-semibold text-foreground">{formatNomorPegawai(nomor)}</span>
            </>
          ) : (
            "Nomor pegawai dibuat otomatis setelah tanggal lahir disimpan, lalu tidak berubah lagi."
          )}
        </p>
      </div>
      {!editing && (
        <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden="true" /> Ubah
        </Button>
      )}
    </div>
  );

  if (!editing) {
    return (
      <section aria-label="Data diri" className="space-y-4 rounded-xl border border-border bg-card p-4">
        {header}
        <ReadOnly data={saved} />
      </section>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await save(fd);
          if (!r.ok) return setError(r.error);
          const next = { ...saved } as Record<string, string | null>;
          for (const f of FIELDS) next[f] = ((fd.get(f) as string | null) ?? "").trim() || null;
          setSaved(next as PersonalData);
          if (r.nomorPegawai) setNomor(r.nomorPegawai);
          setEditing(false);
          toast.success(
            r.nomorBaru && r.nomorPegawai
              ? `Data diri tersimpan. Nomor pegawai Anda: ${formatNomorPegawai(r.nomorPegawai)}`
              : "Data diri tersimpan.",
          );
        });
      }}
    >
      {header}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tempat_lahir" label="Tempat lahir">
          <Input name="tempat_lahir" defaultValue={saved.tempat_lahir ?? ""} maxLength={100} />
        </Field>
        <Field id="tanggal_lahir" label="Tanggal lahir" hint={nomor ? "Salah tanggal? Minta HR membetulkannya." : undefined}>
          <Input name="tanggal_lahir" type="date" defaultValue={saved.tanggal_lahir ?? ""} min="1930-01-01" />
        </Field>
        <Field id="jenis_kelamin" label="Jenis kelamin">
          <NativeSelect name="jenis_kelamin" defaultValue={saved.jenis_kelamin ?? ""}>
            <option value="">—</option>
            {Object.entries(JENIS_KELAMIN_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="agama" label="Agama">
          <NativeSelect name="agama" defaultValue={saved.agama ?? ""}>
            <option value="">—</option>
            {AGAMA_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="pendidikan_terakhir" label="Pendidikan terakhir">
          <NativeSelect name="pendidikan_terakhir" defaultValue={saved.pendidikan_terakhir ?? ""}>
            <option value="">—</option>
            {PENDIDIKAN_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field id="alamat_ktp" label="Alamat sesuai KTP">
        <Textarea name="alamat_ktp" defaultValue={saved.alamat_ktp ?? ""} maxLength={300} className="min-h-16" />
      </Field>
      <Field id="alamat_domisili" label="Alamat domisili" hint="Kosongkan bila sama dengan alamat KTP.">
        <Textarea name="alamat_domisili" defaultValue={saved.alamat_domisili ?? ""} maxLength={300} className="min-h-16" />
      </Field>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? "Menyimpan…" : "Simpan data diri"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="min-h-11"
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
