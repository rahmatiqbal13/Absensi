"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { SetPasswordForm } from "./set-password-form";
import { InviteLinkForm } from "./invite-link-form";

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  // Opened without a token (e.g. from "Punya undangan?" on the login page).
  const [needsLink, setNeedsLink] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    async function establish() {
      // Own-domain invite link: ?t=<hashed_token>. Legacy Supabase /verify
      // links land with tokens in the hash (implicit) or ?code= (PKCE).
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      const code = search.get("code");
      const tokenHash = search.get("t");
      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
          if (error) throw error;
          // Drop the one-time token from the address bar / history.
          window.history.replaceState(null, "", window.location.pathname);
        } else if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Maybe a session already exists (link opened twice).
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            setNeedsLink(true);
            return;
          }
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
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Undangan dari HR</span>
        <h1 className="text-[1.875rem] leading-tight font-semibold tracking-[-0.02em] text-foreground">
          Buat kata sandi Anda
        </h1>
        <p className="text-sm text-muted-foreground">
          {needsLink
            ? "Tempel link undangan yang Anda terima dari HR untuk melanjutkan."
            : "Tetapkan kata sandi untuk akun Anda."}
        </p>
      </div>
      {fatal ? (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertDescription>{fatal}</AlertDescription>
          </Alert>
          <InviteLinkForm />
        </div>
      ) : needsLink ? (
        <InviteLinkForm />
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
