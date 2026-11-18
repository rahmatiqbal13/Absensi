"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Result = { ok: true } | { ok: false; error: string };

export function DecisionForm({
  approve,
  reject,
}: {
  approve: (fd: FormData) => Promise<Result>;
  reject: (fd: FormData) => Promise<Result>;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (fn: (fd: FormData) => Promise<Result>, ok: string) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("catatan", note);
      const r = await fn(fd);
      if (r.ok) toast.success(ok);
      else toast.error(r.error);
    });

  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Catatan (wajib bila menolak)"
        placeholder="Catatan (wajib bila menolak)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        className="min-h-14"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(approve, "Pengajuan disetujui.")}>
          <Check className="size-4" aria-hidden="true" /> Setujui
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(reject, "Pengajuan ditolak.")}>
          <X className="size-4" aria-hidden="true" /> Tolak
        </Button>
      </div>
    </div>
  );
}
