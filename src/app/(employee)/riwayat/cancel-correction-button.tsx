"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CancelCorrectionButton({ action }: { action: () => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="-ml-2 self-start text-destructive hover:bg-destructive/10"
      onClick={() =>
        startTransition(async () => {
          const r = await action();
          if (r.ok) toast.success("Pengajuan koreksi dibatalkan.");
          else toast.error(r.error);
        })
      }
    >
      {pending ? "Membatalkan…" : "Batalkan pengajuan"}
    </Button>
  );
}
