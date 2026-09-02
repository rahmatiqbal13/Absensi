"use client";

import { useState } from "react";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      <Field id="tanggal" label="Tanggal">
        <Input name="tanggal" type="date" className="w-44" />
      </Field>
      <Field id="nama" label="Nama Libur">
        <Input name="nama" />
      </Field>
      <Field id="branchId" label="Cakupan">
        <NativeSelect name="branchId" defaultValue="" className="w-48">
          <option value="">Nasional</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nama}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" disabled={busy}>
        Tambah
      </Button>
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
