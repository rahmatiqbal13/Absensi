"use client";

import { useState } from "react";
import { EmployeeFormFields } from "../employee-form-fields";

type Result = { ok: true; setPasswordUrl: string } | { ok: false; error: string };

export function CreateEmployeeForm({
  branches,
  departments,
  approverOptions,
  createEmployee,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  createEmployee: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    setLink(null);
    setBusy(true);
    try {
      const r = await createEmployee(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLink(r.setPasswordUrl);
    } catch (e) {
      console.error("create-employee-form action failed", e);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (link) {
    return (
      <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-800">
          Karyawan dibuat. Kirim link berikut ke karyawan (berlaku terbatas):
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={link}
            className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
            }}
            className="min-h-10 rounded border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            {copied ? "Tersalin" : "Salin"}
          </button>
        </div>
        <a href="/karyawan" className="inline-block text-sm text-blue-700 hover:underline">
          Kembali ke daftar karyawan
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <EmployeeFormFields
        branches={branches}
        departments={departments}
        approverOptions={approverOptions}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded bg-blue-600 px-5 py-2.5 text-base font-medium text-white disabled:opacity-60"
      >
        Buat &amp; Ambil Link
      </button>
    </form>
  );
}
