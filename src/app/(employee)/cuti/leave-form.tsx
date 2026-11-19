"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { compressPhoto } from "@/lib/attendance/compress-photo";

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

export type LeaveDaysPreview =
  | { ok: true; workingDays: number; chargedDays: number | null; sisa: number | null }
  | { ok: false };

function previewText(p: LeaveDaysPreview): string {
  if (!p.ok) return "";
  let t = `${p.workingDays} hari kerja`;
  if (p.chargedDays != null) {
    t += ` · saldo cuti tahunan berkurang ${p.chargedDays} hari`;
    if (p.chargedDays !== p.workingDays) t += " (dihitung per hari kalender)";
    if (p.sisa != null) t += `, sisa saat ini ${Number.isInteger(p.sisa) ? p.sisa : p.sisa.toFixed(1)}`;
  }
  return t;
}

export function LeaveForm({
  submitLeave,
  previewDays,
}: {
  submitLeave: (formData: FormData) => Promise<ActionResult>;
  /** Server count for the chosen range; the form works without it. */
  previewDays?: (jenis: string, from: string, to: string) => Promise<LeaveDaysPreview>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jenis, setJenis] = useState(JENIS_OPTIONS[0].value);
  const [mulai, setMulai] = useState("");
  const [selesai, setSelesai] = useState("");
  // Keyed by the range it answers, so a stale answer is never shown.
  const [answer, setAnswer] = useState<{ key: string; preview: LeaveDaysPreview } | null>(null);

  const reversed = Boolean(mulai && selesai && selesai < mulai);
  const valid = Boolean(previewDays && mulai && selesai && !reversed);
  const key = `${jenis}|${mulai}|${selesai}`;
  const preview = valid && answer?.key === key ? answer.preview : null;
  useEffect(() => {
    if (!valid || !previewDays) return;
    previewDays(jenis, mulai, selesai)
      .then((p) => setAnswer({ key: `${jenis}|${mulai}|${selesai}`, preview: p }))
      .catch(() => {});
  }, [valid, previewDays, jenis, mulai, selesai]);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      // A phone photo of a doctor's note is often several MB; shrink images
      // before upload (PDFs go as-is).
      const file = formData.get("lampiran");
      if (file instanceof File && file.size > 0 && file.type.startsWith("image/")) {
        formData.set("lampiran", await compressPhoto(file));
      }
      const result = await submitLeave(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      // Controlled fields are not cleared by the form reset.
      setMulai("");
      setSelesai("");
    } catch (e) {
      console.error("submitLeave failed", e);
      setError("Gagal mengirim pengajuan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <Field id="jenis" label="Jenis Cuti">
            <NativeSelect name="jenis" required value={jenis} onChange={(e) => setJenis(e.target.value)}>
              {JENIS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="tanggalMulai" label="Tanggal Mulai">
              <Input name="tanggalMulai" type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} className="min-w-0" />
            </Field>
            <Field id="tanggalSelesai" label="Tanggal Selesai">
              <Input
                name="tanggalSelesai"
                type="date"
                value={selesai}
                min={mulai || undefined}
                onChange={(e) => setSelesai(e.target.value)}
                className="min-w-0"
              />
            </Field>
          </div>
          <p aria-live="polite" className="-mt-1 text-sm empty:hidden">
            {reversed ? (
              <span className="text-destructive">Tanggal selesai sebelum tanggal mulai.</span>
            ) : preview?.ok ? (
              <span className="inline-block rounded-lg bg-muted px-2.5 py-1.5 font-mono text-[0.8rem] text-foreground">
                {previewText(preview)}
              </span>
            ) : null}
          </p>
          <Field id="alasan" label="Alasan">
            <Textarea name="alasan" rows={3} />
          </Field>
          <Field id="lampiran" label={jenis === "sakit" ? "Surat dokter" : "Lampiran (opsional)"}>
            <Input
              name="lampiran"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              aria-describedby="lampiran-hint"
            />
          </Field>
          <p id="lampiran-hint" className="-mt-2 text-xs text-muted-foreground">
            {jenis === "sakit"
              ? "Wajib untuk cuti sakit lebih dari 1 hari. PDF atau foto, maks. 3 MB."
              : "PDF atau foto, maks. 3 MB."}
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>Pengajuan cuti berhasil dikirim.</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            Ajukan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
