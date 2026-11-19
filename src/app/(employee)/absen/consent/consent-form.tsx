"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

/** Agreement checkbox gating the submit; the server action checks it too. */
export function ConsentForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [agree, setAgree] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-6">
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground">
        <input
          type="checkbox"
          name="setuju"
          required
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        Saya memahami dan menyetujui pemrosesan data lokasi dan foto sesuai UU Pelindungan Data Pribadi.
      </label>
      <SubmitButton pendingLabel="Menyimpan…" size="lg" disabled={!agree} className="h-14 w-full rounded-xl text-base">
        Setuju &amp; lanjutkan
      </SubmitButton>
    </form>
  );
}
