"use client";

import { useState, useTransition } from "react";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "../../actions";

const TANGGAL = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Shown once a period is final: record the transfer date ("dibayar"), or undo
 * a mistaken one. The period stays locked either way.
 */
export function PaymentPanel({
  dibayarPada,
  today,
  onSetPaid,
}: {
  dibayarPada: string | null;
  today: string; // YYYY-MM-DD (WIB)
  onSetPaid: (tanggal: string | null) => Promise<ActionResult>;
}) {
  const [tanggal, setTanggal] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(value: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await onSetPaid(value);
      if (r.ok) toast.success(r.message ?? "Tersimpan.");
      else setError(r.error);
    });
  }

  return (
    <section aria-label="Pembayaran" className="rounded-xl border border-border bg-card p-4">
      {dibayarPada ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <BadgeCheck className="size-4 text-success-foreground" aria-hidden="true" />
            Gaji periode ini dibayar pada {TANGGAL.format(new Date(`${dibayarPada}T00:00:00Z`))}.
          </p>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => submit(null)}>
            Batalkan status dibayar
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(tanggal);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tanggal-bayar">Tanggal transfer gaji</Label>
            <Input
              id="tanggal-bayar"
              type="date"
              required
              max={today}
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="h-11 w-48"
            />
          </div>
          <Button type="submit" disabled={pending} className="h-11">
            <BadgeCheck className="size-4" aria-hidden="true" /> Tandai sudah dibayar
          </Button>
        </form>
      )}
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
