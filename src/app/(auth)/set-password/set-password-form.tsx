"use client";

import { useState } from "react";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SubmitResult = { ok: true } | { ok: false; error: string };

export function SetPasswordForm({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<SubmitResult>;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (pw !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setBusy(true);
    try {
      const result = await onSubmit(pw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    } catch (err) {
      console.error("set-password submit failed", err);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert>
        <AlertDescription>Kata sandi berhasil disimpan. Mengalihkan…</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field id="pw" label="Kata Sandi">
        <Input
          id="pw"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          className="h-11 text-base"
        />
      </Field>
      <Field id="confirm" label="Konfirmasi Kata Sandi">
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="h-11 text-base"
        />
      </Field>
      <Button type="submit" disabled={busy} className="h-11 w-full text-base">
        {busy ? "Menyimpan…" : "Simpan"}
      </Button>
    </form>
  );
}
