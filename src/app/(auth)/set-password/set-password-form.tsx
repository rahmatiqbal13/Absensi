"use client";

import { useState } from "react";

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
    return <p className="text-sm text-green-600">Kata sandi tersimpan. Mengalihkan…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="pw" className="text-sm font-medium text-neutral-700">Kata Sandi Baru</label>
        <input
          id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium text-neutral-700">Konfirmasi Kata Sandi</label>
        <input
          id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit" disabled={busy}
        className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
      >
        Simpan
      </button>
    </form>
  );
}
