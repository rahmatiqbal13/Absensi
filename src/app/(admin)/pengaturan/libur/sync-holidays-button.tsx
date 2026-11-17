"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Res = { ok: true; message: string } | { ok: false; error: string };

export function SyncHolidaysButton({ sync }: { sync: () => Promise<Res> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await sync();
            if (r.ok) toast.success(r.message);
            else setError(r.error);
          })
        }
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
        {pending ? "Menyinkronkan…" : "Sinkronkan libur nasional"}
      </Button>
      {error && (
        <p role="alert" className="text-[0.8rem] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
