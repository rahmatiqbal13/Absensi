"use client";

import { useState } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Pull the one-time invite token out of whatever the employee pasted: the full
 * link HR sent (`…/set-password?t=…`), a link a chat app re-wrapped, or the
 * bare token. Returns the query string to append to /set-password, or null.
 */
export function inviteQueryFrom(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const t = url.searchParams.get("t");
    if (t) {
      // Keep the link kind: a reset link must be verified as `recovery`.
      const recovery = url.searchParams.get("type") === "recovery" ? "&type=recovery" : "";
      return `?t=${encodeURIComponent(t)}${recovery}`;
    }
    const code = url.searchParams.get("code");
    if (code) return `?code=${encodeURIComponent(code)}`;
    if (url.hash.includes("access_token=")) return url.hash; // legacy Supabase verify redirect
    return null;
  } catch {
    // Not a URL: accept a bare hashed token (hex / url-safe, no spaces).
    return /^[A-Za-z0-9_-]{16,}$/.test(text) ? `?t=${encodeURIComponent(text)}` : null;
  }
}

export function InviteLinkForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = inviteQueryFrom(value);
    if (!q) {
      setError("Link tidak dikenali. Tempel link lengkap dari HR, yang berisi “/set-password?t=”.");
      return;
    }
    // Full navigation on purpose: the set-password page reads the token once on
    // mount, and router.push to the same route would not remount it.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/set-password${q}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="invite-link" label="Link undangan" error={error ?? undefined}>
        <Input
          id="invite-link"
          name="invite-link"
          inputMode="url"
          autoComplete="off"
          placeholder="https://…/set-password?t=…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          className="h-12 text-base"
        />
      </Field>
      <Button type="submit" className="h-[50px] w-full rounded-xl text-[0.95rem]">
        Lanjutkan
      </Button>
    </form>
  );
}
