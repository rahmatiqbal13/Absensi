"use client";

import { useState } from "react";
import { MONTH_NAMES_ID } from "@/lib/format/month";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
      <Field id="branchId" label="Cabang">
        <NativeSelect name="branchId" required defaultValue={branches[0]?.id ?? ""} className="w-44">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="bulan" label="Bulan">
        <NativeSelect name="bulan" defaultValue={String(now.getMonth() + 1)} className="w-40">
          {MONTH_NAMES_ID.map((label, i) => (
            <option key={label} value={i + 1}>{label}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="tahun" label="Tahun">
        <Input name="tahun" type="number" defaultValue={now.getFullYear()} className="w-28" />
      </Field>
      <Button type="submit" disabled={submitting}>Buat Periode</Button>
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="w-full">
          <AlertDescription>Periode dibuat.</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
