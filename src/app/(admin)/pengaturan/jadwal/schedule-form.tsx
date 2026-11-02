"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ScheduleDefaults = {
  jamMasuk: string;
  jamPulang: string;
  hariKerja: number[];
  toleransiMenit: number;
  potongTerlambat?: boolean;
} | null;
type Result = { ok: true } | { ok: false; error: string };

// Monday-first, as on a work-week calendar; values stay 0=Sun..6=Sat.
const DAYS_MON_FIRST = [
  { v: 1, label: "Sen" }, { v: 2, label: "Sel" }, { v: 3, label: "Rab" }, { v: 4, label: "Kam" },
  { v: 5, label: "Jum" }, { v: 6, label: "Sab" }, { v: 0, label: "Min" },
];

export function ScheduleForm({
  branchId, branchNama, defaults, saveSchedule,
}: {
  branchId: string;
  branchNama: string;
  defaults: ScheduleDefaults;
  saveSchedule: (branchId: string, fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const days = new Set(defaults?.hariKerja ?? [1, 2, 3, 4, 5]);

  async function action(fd: FormData) {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const r = await saveSchedule(branchId, fd);
      if (!r.ok) { setError(r.error); return; }
      setMsg("Jadwal tersimpan.");
    } catch (e) {
      console.error(e);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{branchNama}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-5.5">
          <div className="flex flex-wrap items-end gap-4">
            <Field id={`jamMasuk-${branchId}`} label="Jam Masuk">
              <Input name="jamMasuk" type="time" defaultValue={defaults?.jamMasuk ?? "09:00"} className="h-11.5 w-38 font-mono" />
            </Field>
            <Field id={`jamPulang-${branchId}`} label="Jam Pulang">
              <Input name="jamPulang" type="time" defaultValue={defaults?.jamPulang ?? "17:00"} className="h-11.5 w-38 font-mono" />
            </Field>
            <Field id={`toleransiMenit-${branchId}`} label="Toleransi (menit)">
              <Input name="toleransiMenit" type="number" min="0" defaultValue={defaults?.toleransiMenit ?? 15} className="h-11.5 w-28 font-mono" />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[0.8rem] font-semibold text-foreground">Hari kerja</legend>
            <div className="grid max-w-[560px] grid-cols-7 gap-1.5">
              {DAYS_MON_FIRST.map((d) => (
                <label key={d.v} className="relative">
                  <input
                    type="checkbox"
                    name="hariKerja"
                    value={d.v}
                    defaultChecked={days.has(d.v)}
                    className="peer sr-only"
                  />
                  <span className="grid h-13 cursor-pointer place-items-center rounded-[10px] bg-muted text-sm font-semibold text-muted-foreground transition-colors select-none peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-brand/40">
                    {d.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex cursor-pointer items-start gap-3.5 rounded-xl bg-background p-4">
            <span className="relative mt-0.5 inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                name="potongTerlambat"
                defaultChecked={defaults?.potongTerlambat ?? false}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="h-7 w-[46px] rounded-full bg-input/60 transition-colors peer-checked:bg-brand peer-focus-visible:ring-3 peer-focus-visible:ring-brand/40"
              />
              <span
                aria-hidden="true"
                className="absolute top-[3px] left-[3px] size-[22px] rounded-full bg-field shadow-sm transition-transform peer-checked:translate-x-[18px]"
              />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[0.9rem] font-semibold text-foreground">
                Potong gaji per menit untuk terlambat / pulang cepat
              </span>
              <span className="max-w-[620px] text-sm leading-relaxed text-muted-foreground">
                Aktifkan hanya bila diatur di perjanjian kerja, peraturan perusahaan, atau PKB. Total potongan
                dibatasi 50% gaji pokok. Ketidakhadiran tanpa izin tetap tidak dibayar.
              </span>
            </span>
          </label>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {msg && <Alert><AlertDescription>{msg}</AlertDescription></Alert>}
          <Button type="submit" disabled={busy} className="h-11 self-start px-5">Simpan jadwal {branchNama}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
