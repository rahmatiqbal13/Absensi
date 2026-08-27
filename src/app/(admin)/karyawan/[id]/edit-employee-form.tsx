"use client";

import { useState } from "react";
import { EmployeeFormFields, type EmployeeFieldValues } from "../employee-form-fields";

type Result = { ok: true } | { ok: false; error: string };

export function EditEmployeeForm({
  employeeId,
  defaults,
  branches,
  departments,
  approverOptions,
  updateEmployee,
  setStatus,
  currentStatus,
  isSelf,
}: {
  employeeId: string;
  defaults: Partial<EmployeeFieldValues>;
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  updateEmployee: (id: string, fd: FormData) => Promise<Result>;
  setStatus: (id: string, status: "aktif" | "nonaktif") => Promise<Result>;
  currentStatus: "aktif" | "nonaktif";
  isSelf: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function run(fn: () => Promise<Result>, okMsg: string): Promise<boolean> {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      setMsg(okMsg);
      return true;
    } catch (e) {
      console.error("edit-employee-form action failed", e);
      setError("Terjadi kesalahan. Coba lagi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        action={(fd) => {
          void run(() => updateEmployee(employeeId, fd), "Perubahan tersimpan.");
        }}
        className="space-y-6"
      >
        <EmployeeFormFields
          branches={branches}
          departments={departments}
          approverOptions={approverOptions}
          defaults={defaults}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded bg-blue-600 px-5 py-2.5 text-base font-medium text-white disabled:opacity-60"
        >
          Simpan Perubahan
        </button>
      </form>

      {!isSelf && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          {currentStatus === "aktif" ? (
            !confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="min-h-11 rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700"
              >
                Nonaktifkan Karyawan
              </button>
            ) : (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span>Nonaktifkan karyawan ini? Mereka tak bisa login.</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await run(
                      () => setStatus(employeeId, "nonaktif"),
                      "Karyawan dinonaktifkan.",
                    );
                    if (ok) setConfirming(false);
                  }}
                  className="rounded bg-red-600 px-3 py-1.5 font-medium text-white disabled:opacity-60"
                >
                  Ya, nonaktifkan
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded border border-neutral-300 px-3 py-1.5"
                >
                  Batal
                </button>
              </span>
            )
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => setStatus(employeeId, "aktif"), "Karyawan diaktifkan kembali.")}
              className="min-h-11 rounded border border-green-300 px-4 py-2 text-sm font-medium text-green-700 disabled:opacity-60"
            >
              Aktifkan Kembali
            </button>
          )}
        </div>
      )}
    </div>
  );
}
