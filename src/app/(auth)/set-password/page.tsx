"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    async function establish() {
      // Implicit flow: tokens in the URL hash. PKCE flow: ?code= in the query.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      const code = search.get("code");
      try {
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Maybe a session already exists (link opened twice).
          const { data } = await supabase.auth.getSession();
          if (!data.session) throw new Error("no token");
        }
        setReady(true);
      } catch (err) {
        console.error("set-password: could not establish session", err);
        setFatal("Link ini tidak valid atau sudah kedaluwarsa. Minta link baru ke HR.");
      }
    }
    establish();
  }, []);

  async function onSubmit(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      console.error("set-password: updateUser failed", error);
      return { ok: false, error: "Gagal menyimpan kata sandi. Coba minta link baru ke HR." };
    }
    setTimeout(() => router.replace("/absen"), 800);
    return { ok: true };
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900">Buat Kata Sandi</h1>
        <p className="mb-6 text-sm text-neutral-500">Tetapkan kata sandi untuk akun Anda.</p>
        {fatal ? (
          <p className="text-sm text-red-600">{fatal}</p>
        ) : ready ? (
          <SetPasswordForm onSubmit={onSubmit} />
        ) : (
          <p className="text-sm text-neutral-500">Memeriksa link…</p>
        )}
      </div>
    </main>
  );
}
