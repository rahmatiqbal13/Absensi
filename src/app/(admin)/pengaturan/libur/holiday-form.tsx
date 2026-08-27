"use client";

import { useState } from "react";

type Result = { ok: true } | { ok: false; error: string };

export function HolidayForm({
  branches,
  addHoliday,
}: {
  branches: { id: string; nama: string }[];
  addHoliday: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function action(fd: FormData) {
    setError(null);
    setBusy(true);
    try {
      const r = await addHoliday(fd);
      if (!r.ok) setError(r.error);
    } catch (e) {
      console.error(e);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {/* No HTML `required` — jsdom/React 19 form-action tests submit these empty;
          addHoliday() validates server-side (ISO date + non-empty nama). */}
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Tanggal
        <input
          name="tanggal"
          type="date"
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Nama Libur
        <input
          name="nama"
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Cakupan
        <select
          name="branchId"
          defaultValue=""
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Nasional</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nama}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Tambah
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
