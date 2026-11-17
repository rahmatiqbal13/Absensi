"use client";

import { useState, type ReactNode } from "react";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type ScheduleDefaults = {
  jamMasuk: string;
  jamPulang: string;
  hariKerja: number[];
  toleransiMenit: number;
  potongTerlambat?: boolean;
  hitungLembur?: boolean;
} | null;
type Result = { ok: true } | { ok: false; error: string };

// Monday-first, as on a work-week calendar; values stay 0=Sun..6=Sat.
export const DAYS_MON_FIRST = [
  { v: 1, label: "Sen" }, { v: 2, label: "Sel" }, { v: 3, label: "Rab" }, { v: 4, label: "Kam" },
  { v: 5, label: "Jum" }, { v: 6, label: "Sab" }, { v: 0, label: "Min" },
];

/**
 * One schedule's fields. `departmentId` null = the branch default; otherwise
 * that department's own schedule.
 */
export function ScheduleForm({
  branchId, departmentId = null, label, defaults, saveSchedule, extraActions,
}: {
  branchId: string;
  departmentId?: string | null;
  /** Shown in the submit button: "Simpan jadwal {label}". */
  label: string;
  defaults: ScheduleDefaults;
  saveSchedule: (branchId: string, departmentId: string | null, fd: FormData) => Promise<Result>;
  extraActions?: ReactNode;
}) {
  const key = departmentId ?? branchId;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const days = new Set(defaults?.hariKerja ?? [1, 2, 3, 4, 5]);
  // Live copy of the inputs, only for the week preview below.
  const [preview, setPreview] = useState({
    masuk: defaults?.jamMasuk ?? "09:00",
    pulang: defaults?.jamPulang ?? "17:00",
    days: [...days],
  });

  async function action(fd: FormData) {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const r = await saveSchedule(branchId, departmentId, fd);
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
    <form action={action} className="flex flex-col gap-5.5">
      <div className="flex flex-wrap items-end gap-4">
        <Field id={`jamMasuk-${key}`} label="Jam Masuk">
          <Input name="jamMasuk" type="time" defaultValue={defaults?.jamMasuk ?? "09:00"} onChange={(e) => setPreview((p) => ({ ...p, masuk: e.target.value }))} className="h-11.5 w-38 font-mono" />
        </Field>
        <Field id={`jamPulang-${key}`} label="Jam Pulang">
          <Input name="jamPulang" type="time" defaultValue={defaults?.jamPulang ?? "17:00"} onChange={(e) => setPreview((p) => ({ ...p, pulang: e.target.value }))} className="h-11.5 w-38 font-mono" />
        </Field>
        <Field id={`toleransiMenit-${key}`} label="Toleransi (menit)">
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
                onChange={(e) =>
                  setPreview((p) => ({
                    ...p,
                    days: e.target.checked ? [...p.days, d.v] : p.days.filter((x) => x !== d.v),
                  }))
                }
                className="peer sr-only"
              />
              <span className="grid h-13 cursor-pointer place-items-center rounded-[10px] bg-muted text-sm font-semibold text-muted-foreground transition-colors select-none peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-brand/40">
                {d.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <WeekPreview masuk={preview.masuk} pulang={preview.pulang} days={preview.days} />
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
      <label className="flex cursor-pointer items-start gap-3.5 rounded-xl bg-background p-4">
        <span className="relative mt-0.5 inline-flex shrink-0">
          <input
            type="checkbox"
            role="switch"
            name="hitungLembur"
            defaultChecked={defaults?.hitungLembur ?? false}
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
            Hitung lembur
          </span>
          <span className="max-w-[620px] text-sm leading-relaxed text-muted-foreground">
            Jam pulang yang lewat dari jadwal (minimal 30 menit, maks. 4 jam/hari) dibayar sebagai lembur: 1/173 gaji per
            jam, jam pertama 1,5×, berikutnya 2×. Aktifkan hanya bila lembur di unit ini memang diperintahkan tertulis.
          </span>
        </span>
      </label>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {msg && <Alert><AlertDescription>{msg}</AlertDescription></Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy} className="h-11 px-5">Simpan jadwal {label}</Button>
        {extraActions}
      </div>
    </form>
  );
}

// 06:00–20:00 window, one bar per day showing the working hours.
const PREVIEW_START = 6;
const PREVIEW_SPAN = 14;
function toHours(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) + (Number.isFinite(m) ? m : 0) / 60;
}

function WeekPreview({ masuk, pulang, days }: { masuk: string; pulang: string; days: number[] }) {
  const start = toHours(masuk);
  const end = toHours(pulang);
  const left = Math.min(100, Math.max(0, ((start - PREVIEW_START) / PREVIEW_SPAN) * 100));
  const width = Math.max(0, Math.min(100 - left, ((end - start) / PREVIEW_SPAN) * 100));
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.8rem] font-semibold text-foreground">Pratinjau minggu</span>
      <div aria-hidden="true" className="flex max-w-[560px] flex-col gap-1">
        {DAYS_MON_FIRST.map((d) => (
          <div key={d.v} className="grid grid-cols-[40px_1fr] items-center gap-2.5">
            <span className="font-mono text-[0.72rem] text-muted-foreground">{d.label}</span>
            <span className="relative h-3 rounded-[3px] bg-muted">
              {days.includes(d.v) && (
                <span
                  className="absolute inset-y-0 rounded-[3px] bg-brand"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              )}
            </span>
          </div>
        ))}
      </div>
      <span
        aria-hidden="true"
        className="flex max-w-[560px] justify-between pl-[50px] font-mono text-[0.7rem] text-muted-foreground"
      >
        <span>06</span>
        <span>13</span>
        <span>20</span>
      </span>
      <span className="sr-only">
        {days.length} hari kerja, {masuk}–{pulang}
      </span>
    </div>
  );
}
