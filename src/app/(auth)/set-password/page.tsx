"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Buat Kata Sandi</h1>
        <p className="text-sm text-muted-foreground">Tetapkan kata sandi untuk akun Anda.</p>
      </div>
      {fatal ? (
        <Alert variant="destructive">
          <AlertDescription>{fatal}</AlertDescription>
        </Alert>
      ) : ready ? (
        <SetPasswordForm onSubmit={onSubmit} />
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <p className="text-sm text-muted-foreground">Memeriksa link…</p>
        </div>
      )}
    </div>
  );
}
