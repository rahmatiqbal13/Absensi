"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  REMINDER_ISI_MAX,
  REMINDER_JUDUL_MAX,
  REMINDER_LABEL,
  REMINDER_MAX_MENIT,
  renderReminder,
  type ReminderSetting,
} from "@/lib/attendance/reminder-settings";

type Result = { ok: true } | { ok: false; error: string };

/** One reminder's settings, with a live preview of the notification. */
export function ReminderForm({
  setting,
  save,
  disabled,
}: {
  setting: ReminderSetting;
  save: (fd: FormData) => Promise<Result>;
  disabled?: boolean;
}) {
  const [aktif, setAktif] = useState(setting.aktif);
  const [judul, setJudul] = useState(setting.judul);
  const [isi, setIsi] = useState(setting.isi);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = REMINDER_LABEL[setting.jenis];
  const id = `reminder-${setting.jenis}`;
  const sampleJam = setting.jenis === "pulang" ? "17:00" : "08:00";
  const sample = { nama: "Budi", jam: sampleJam };

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      action={(fd) => {
        setError(null);
        fd.set("jenis", setting.jenis);
        fd.set("aktif", aktif ? "true" : "false");
        startTransition(async () => {
          const r = await save(fd);
          if (r.ok) toast.success(`${label.title} disimpan.`);
          else setError(r.error);
        });
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-foreground">{label.title}</h2>
          <p className="text-sm text-muted-foreground">{label.description}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <Checkbox checked={aktif} onCheckedChange={(v) => setAktif(v === true)} disabled={disabled} aria-label={`Aktifkan ${label.title.toLowerCase()}`} />
          Aktif
        </label>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Dimmed, not disabled, when off: disabled fields aren't submitted. */}
      <fieldset disabled={disabled} className={aktif ? "space-y-4" : "space-y-4 opacity-60"}>
        <Field id={`${id}-menit`} label={label.menitLabel} hint={`0–${REMINDER_MAX_MENIT} menit, mengikuti jadwal kerja masing-masing karyawan.`}>
          <Input name="menit" type="number" inputMode="numeric" min={0} max={REMINDER_MAX_MENIT} step={1} defaultValue={setting.menit} required className="h-11 max-w-32" />
        </Field>
        <Field id={`${id}-judul`} label="Judul notifikasi">
          <Input name="judul" value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={REMINDER_JUDUL_MAX} required className="h-11" />
        </Field>
        <Field id={`${id}-isi`} label="Isi pesan" hint="Gunakan {nama} untuk nama karyawan dan {jam} untuk jam jadwalnya.">
          <Textarea name="isi" value={isi} onChange={(e) => setIsi(e.target.value)} maxLength={REMINDER_ISI_MAX} required rows={3} />
        </Field>
      </fieldset>

      <div className="rounded-lg bg-muted/60 p-3">
        <p className="text-xs font-medium text-muted-foreground">Pratinjau (jadwal {sampleJam})</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{renderReminder(judul, sample)}</p>
        <p className="text-sm text-muted-foreground">{renderReminder(isi, sample)}</p>
      </div>

      <Button type="submit" disabled={pending || disabled} className="h-11 w-full sm:w-auto">
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </form>
  );
}
