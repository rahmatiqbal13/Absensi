"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium text-foreground">
          Karyawan dibuat. Kirim link berikut ke karyawan (berlaku terbatas):
        </p>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={link}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? "Tersalin" : "Salin"}
          </Button>
        </div>
        <Button asChild variant="link">
          <Link href="/karyawan">Kembali ke daftar karyawan</Link>
        </Button>
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
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={busy}>
        Buat &amp; Ambil Link
      </Button>
    </form>
  );
}
