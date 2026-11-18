"use client";

import { useRef, useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: true } | { ok: false; error: string };

export function ChangePasswordForm({ changePassword }: { changePassword: (fd: FormData) => Promise<Result> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <KeyRound className="size-4" aria-hidden="true" /> Ganti kata sandi
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await changePassword(fd);
          if (r.ok) {
            toast.success("Kata sandi berhasil diganti.");
            formRef.current?.reset();
            setOpen(false);
          } else setError(r.error);
        });
      }}
    >
      <h2 className="text-base font-semibold">Ganti kata sandi</h2>
      <Field id="current" label="Kata sandi saat ini" required>
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field id="next" label="Kata sandi baru" hint="Minimal 8 karakter." required>
        <Input name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field id="confirm" label="Ulangi kata sandi baru" required>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan kata sandi"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </form>
  );
}
