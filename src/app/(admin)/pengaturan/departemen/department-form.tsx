"use client";

import { useState } from "react";

type Result = { ok: true } | { ok: false; error: string };

export function DepartmentForm({
  branches, addDepartment,
}: {
  branches: { id: string; nama: string }[];
  addDepartment: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function action(fd: FormData) {
    setError(null);
    setBusy(true);
    try {
      const r = await addDepartment(fd);
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
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Nama Departemen
        <input name="nama" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Cabang
        <select name="branchId" defaultValue={branches[0]?.id ?? ""} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy} className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Tambah</button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
