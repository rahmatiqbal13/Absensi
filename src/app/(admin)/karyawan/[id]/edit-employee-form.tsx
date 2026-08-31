"use client";

import { useState } from "react";
import { EmployeeFormFields, type EmployeeFieldValues } from "../employee-form-fields";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

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
          emailReadOnly
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {msg && (
          <Alert>
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={busy}>
          Simpan Perubahan
        </Button>
      </form>

      {!isSelf && (
        <Card size="sm">
          <CardContent className="space-y-2">
            {currentStatus === "aktif" ? (
              !confirming ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirming(true)}
                >
                  Nonaktifkan Karyawan
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Nonaktifkan karyawan ini? Mereka tak bisa login.</span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await run(
                        () => setStatus(employeeId, "nonaktif"),
                        "Karyawan dinonaktifkan.",
                      );
                      if (ok) setConfirming(false);
                    }}
                  >
                    Ya, nonaktifkan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirming(false)}
                  >
                    Batal
                  </Button>
                </div>
              )
            ) : (
              <Button
                type="button"
                variant="outline"
                className="border-emerald-500/40 text-emerald-600 dark:text-emerald-500"
                disabled={busy}
                onClick={() => run(() => setStatus(employeeId, "aktif"), "Karyawan diaktifkan kembali.")}
              >
                Aktifkan Kembali
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
