"use client";

import { useRef, useState, useTransition } from "react";
import { Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export function AnnouncementComposer({
  branches,
  departments,
  create,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  create: (fd: FormData) => Promise<Result>;
}) {
  const [sasaran, setSasaran] = useState("semua");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await create(fd);
          if (r.ok) {
            toast.success(r.message ?? "Pengumuman terkirim.");
            form.current?.reset();
            setSasaran("semua");
          } else setError(r.error);
        });
      }}
    >
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Megaphone className="size-4" aria-hidden="true" /> Buat pengumuman
      </h2>
      <Field id="judul" label="Judul" required>
        <Input name="judul" maxLength={150} required />
      </Field>
      <Field id="isi" label="Isi" required>
        <Textarea name="isi" maxLength={5000} required className="min-h-28" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sasaran" label="Kirim ke">
          <NativeSelect name="sasaran" value={sasaran} onChange={(e) => setSasaran(e.target.value)}>
            <option value="semua">Semua karyawan</option>
            <option value="cabang">Satu cabang</option>
            <option value="departemen">Satu departemen</option>
          </NativeSelect>
        </Field>
        {sasaran === "cabang" && (
          <Field id="branch_id" label="Cabang" required>
            <NativeSelect name="branch_id" required defaultValue="">
              <option value="" disabled>Pilih cabang</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.nama}</option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {sasaran === "departemen" && (
          <Field id="department_id" label="Departemen" required>
            <NativeSelect name="department_id" required defaultValue="">
              <option value="" disabled>Pilih departemen</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.nama}</option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Penerima mendapat notifikasi di lonceng dan di HP (bagi yang mengaktifkan notifikasi perangkat).
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Mengirim…" : "Kirim pengumuman"}
      </Button>
    </form>
  );
}

export function DeleteAnnouncementButton({ onDelete }: { onDelete: () => Promise<Result> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-destructive"
      disabled={pending}
      aria-label="Hapus pengumuman"
      onClick={() => {
        if (!window.confirm("Hapus pengumuman ini?")) return;
        startTransition(async () => {
          const r = await onDelete();
          if (r.ok) toast.success("Pengumuman dihapus.");
          else toast.error(r.error);
        });
      }}
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </Button>
  );
}
