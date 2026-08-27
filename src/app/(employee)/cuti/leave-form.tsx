"use client";

import { useState } from "react";

const JENIS_OPTIONS = [
  { value: "tahunan", label: "Cuti Tahunan" },
  { value: "sakit", label: "Sakit" },
  { value: "melahirkan", label: "Melahirkan" },
  { value: "keguguran", label: "Keguguran" },
  { value: "menikah", label: "Menikah" },
  { value: "menikahkan_anak", label: "Menikahkan Anak" },
  { value: "khitan_baptis_anak", label: "Khitan/Baptis Anak" },
  { value: "istri_melahirkan_keguguran", label: "Istri Melahirkan/Keguguran" },
  { value: "kematian_keluarga_inti", label: "Kematian Keluarga Inti" },
  { value: "kematian_keluarga_serumah", label: "Kematian Keluarga Serumah" },
  { value: "lainnya", label: "Lainnya" },
];

type ActionResult = { ok: true } | { ok: false; error: string };

const inputClasses =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";

export function LeaveForm({
  submitLeave,
}: {
  submitLeave: (formData: FormData) => Promise<ActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const result = await submitLeave(formData);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]"
    >
      <div className="space-y-1">
        <label htmlFor="jenis" className="text-sm font-medium text-neutral-700">
          Jenis Cuti
        </label>
        <select id="jenis" name="jenis" required className={inputClasses}>
          {JENIS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="tanggalMulai" className="text-sm font-medium text-neutral-700">
          Tanggal Mulai
        </label>
        <input id="tanggalMulai" name="tanggalMulai" type="date" className={inputClasses} />
      </div>
      <div className="space-y-1">
        <label htmlFor="tanggalSelesai" className="text-sm font-medium text-neutral-700">
          Tanggal Selesai
        </label>
        <input id="tanggalSelesai" name="tanggalSelesai" type="date" className={inputClasses} />
      </div>
      <div className="space-y-1">
        <label htmlFor="alasan" className="text-sm font-medium text-neutral-700">
          Alasan
        </label>
        <textarea id="alasan" name="alasan" rows={3} className={inputClasses} />
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Pengajuan cuti berhasil dikirim.
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none"
      >
        Ajukan
      </button>
    </form>
  );
}
