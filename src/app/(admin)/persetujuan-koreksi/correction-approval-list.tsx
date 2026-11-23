"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, ClipboardCheck, X } from "lucide-react";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AttendanceStatus } from "@/lib/attendance/status";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

export type PendingCorrection = {
  id: string;
  employeeName: string;
  jabatan: string | null;
  tanggal: string;
  proposed: { jamMasuk: string; jamPulang: string | null };
  /** The attendance row on record now; null when the day has none (e.g. forgot to clock in). */
  current: { jamMasuk: string | null; jamPulang: string | null; status: string } | null;
  alasan: string;
};

function jam(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });
}

function tanggal(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function CorrectionCard({
  r,
  highlighted,
  approve,
  reject,
}: {
  r: PendingCorrection;
  highlighted: boolean;
  approve: (id: string, catatan: string | null) => Promise<Result>;
  reject: (id: string, catatan: string) => Promise<Result>;
}) {
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteId = `catatan-${r.id}`;

  function run(kind: "approve" | "reject") {
    const note = catatan.trim();
    if (kind === "reject" && !note) {
      setError("Catatan wajib diisi untuk menolak.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = kind === "approve" ? await approve(r.id, note || null) : await reject(r.id, note);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <Card className={cn(highlighted && "ring-2 ring-brand")}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-base font-semibold">{r.employeeName}</span>
            {r.jabatan && <span className="text-sm text-muted-foreground">{r.jabatan}</span>}
          </div>
          <span className="text-sm font-medium">{tanggal(r.tanggal)}</span>
        </div>

        <div className="grid items-center gap-3 rounded-xl bg-secondary p-3.5 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Tercatat</span>
            {r.current ? (
              <span className="flex flex-wrap items-center gap-2 font-mono text-sm tabular-nums">
                {jam(r.current.jamMasuk)} – {jam(r.current.jamPulang)}
                <AttendanceStatusBadge status={r.current.status as AttendanceStatus} />
              </span>
            ) : (
              <Badge variant="neutral" className="self-start">Tidak ada absen</Badge>
            )}
          </div>
          <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Diajukan</span>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {jam(r.proposed.jamMasuk)} – {jam(r.proposed.jamPulang)}
            </span>
          </div>
        </div>

        <p className="text-sm">
          <span className="font-semibold">Alasan: </span>
          {r.alasan}
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>Catatan (wajib jika menolak)</Label>
          <Textarea id={noteId} rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("approve")} disabled={pending}>
            <Check className="size-4" aria-hidden="true" /> Setujui
          </Button>
          <Button variant="outline" onClick={() => run("reject")} disabled={pending} className="text-destructive">
            <X className="size-4" aria-hidden="true" /> Tolak
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CorrectionApprovalList({
  requests,
  highlightId,
  approve,
  reject,
}: {
  requests: PendingCorrection[];
  highlightId?: string;
  approve: (id: string, catatan: string | null) => Promise<Result>;
  reject: (id: string, catatan: string) => Promise<Result>;
}) {
  if (requests.length === 0) {
    return <EmptyState icon={ClipboardCheck} message="Tidak ada pengajuan koreksi yang menunggu persetujuan." />;
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {requests.map((r) => (
        <li key={r.id}>
          <CorrectionCard r={r} highlighted={r.id === highlightId} approve={approve} reject={reject} />
        </li>
      ))}
    </ul>
  );
}
