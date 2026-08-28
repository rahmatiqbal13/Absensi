"use client";

import { useState } from "react";

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
    <form action={action} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-neutral-900">{branchNama}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Jam Masuk
          <input name="jamMasuk" type="time" defaultValue={defaults?.jamMasuk ?? "09:00"} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Jam Pulang
          <input name="jamPulang" type="time" defaultValue={defaults?.jamPulang ?? "17:00"} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Toleransi (menit)
          <input name="toleransiMenit" type="number" min="0" defaultValue={defaults?.toleransiMenit ?? 15} className="w-24 rounded border border-neutral-300 px-3 py-2 text-sm" />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="text-sm text-neutral-700">Hari kerja</legend>
        {DAYS.map((d) => (
          <label key={d.v} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="hariKerja" value={d.v} defaultChecked={days.has(d.v)} />
            {d.label}
          </label>
        ))}
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      <button type="submit" disabled={busy} className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Simpan</button>
    </form>
  );
}
