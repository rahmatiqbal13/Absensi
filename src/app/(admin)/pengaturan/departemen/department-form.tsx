"use client";

import { useState } from "react";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      <Field id="nama" label="Nama Departemen">
        <Input name="nama" />
      </Field>
      <Field id="branchId" label="Cabang">
        <NativeSelect name="branchId" defaultValue={branches[0]?.id ?? ""} className="w-44">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" disabled={busy}>Tambah</Button>
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
