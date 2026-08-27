"use client";

import { useState } from "react";
import { MONTH_NAMES_ID } from "@/lib/format/month";
import type { ActionResult } from "./actions";

export function CreatePeriodForm({
  branches,
  createPeriod,
}: {
  branches: { id: string; nama: string }[];
  createPeriod: (formData: FormData) => Promise<ActionResult>;
}) {
  const now = new Date();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const result = await createPeriod(formData);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="branchId" className="text-sm text-neutral-700">Cabang</label>
        <select id="branchId" name="branchId" required className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="bulan" className="text-sm text-neutral-700">Bulan</label>
        <select id="bulan" name="bulan" defaultValue={String(now.getMonth() + 1)} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {MONTH_NAMES_ID.map((label, i) => (
            <option key={label} value={i + 1}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="tahun" className="text-sm text-neutral-700">Tahun</label>
        <input id="tahun" name="tahun" type="number" defaultValue={now.getFullYear()} className="w-24 rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Buat Periode
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
      {success && <p className="w-full text-sm text-green-600">Periode dibuat.</p>}
    </form>
  );
}
