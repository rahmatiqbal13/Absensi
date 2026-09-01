"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ScheduleDefaults = { jamMasuk: string; jamPulang: string; hariKerja: number[]; toleransiMenit: number } | null;
type Result = { ok: true } | { ok: false; error: string };

const DAYS = [
  { v: 0, label: "Min" }, { v: 1, label: "Sen" }, { v: 2, label: "Sel" }, { v: 3, label: "Rab" },
  { v: 4, label: "Kam" }, { v: 5, label: "Jum" }, { v: 6, label: "Sab" },
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
        <form action={action} className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field id={`jamMasuk-${branchId}`} label="Jam Masuk">
              <Input name="jamMasuk" type="time" defaultValue={defaults?.jamMasuk ?? "09:00"} className="w-36" />
            </Field>
            <Field id={`jamPulang-${branchId}`} label="Jam Pulang">
              <Input name="jamPulang" type="time" defaultValue={defaults?.jamPulang ?? "17:00"} className="w-36" />
            </Field>
            <Field id={`toleransiMenit-${branchId}`} label="Toleransi (menit)">
              <Input name="toleransiMenit" type="number" min="0" defaultValue={defaults?.toleransiMenit ?? 15} className="w-28" />
            </Field>
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-sm font-medium text-foreground">Hari kerja</legend>
            {DAYS.map((d) => (
              <label key={d.v} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="hariKerja"
                  value={d.v}
                  defaultChecked={days.has(d.v)}
                  className="size-4 rounded border-input accent-primary"
                />
                {d.label}
              </label>
            ))}
          </fieldset>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {msg && <Alert><AlertDescription>{msg}</AlertDescription></Alert>}
          <Button type="submit" disabled={busy}>Simpan</Button>
        </form>
      </CardContent>
    </Card>
  );
}
