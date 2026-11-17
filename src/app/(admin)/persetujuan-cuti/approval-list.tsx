"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveReview } from "@/lib/leave/review-context";
import { LEAVE_JENIS_LABELS, formatLeaveRange } from "@/lib/leave/labels";
import { cn } from "@/lib/utils";

export type PendingLeaveRequest = {
  id: string;
  employeeName: string;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  alasan: string | null;
  /** "Jabatan · Departemen · Cabang" under the name. */
  meta?: string;
  /** Working days, balance and team clashes; null when it failed to load. */
  review?: LeaveReview | null;
};

type ActionResult = { ok: true } | { ok: false; error: string };

const JENIS_LABELS = LEAVE_JENIS_LABELS;
const formatRange = formatLeaveRange;

// Inclusive calendar-day count — only a fallback when the server-computed
// working-day count (branch schedule minus holidays) didn't load.
function calendarDays(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function durationOf(r: PendingLeaveRequest): { n: number; working: boolean } {
  return r.review
    ? { n: r.review.workingDays, working: true }
    : { n: calendarDays(r.tanggalMulai, r.tanggalSelesai), working: false };
}

function balanceText(review: LeaveReview): string {
  if (!review.balance) return "Tidak memotong saldo";
  const { sisa, awal } = review.balance;
  return `${sisa} dari ${awal} hari`;
}

function clashText(review: LeaveReview): string {
  const names = review.clashes.map(
    (c) => `${c.nama} (${c.status === "approved" ? "disetujui" : "menunggu"}, ${formatRange(c.tanggalMulai, c.tanggalSelesai)})`,
  );
  const off = review.clashes.length + 1;
  const team = review.departmentName ?? "departemen ini";
  const size = review.teamSize ? ` dari ${review.teamSize}` : "";
  return `Bertabrakan dengan cuti ${names.join(", ")}. ${off}${size} orang ${team} akan absen di periode yang sama.`;
}

function initials(nama: string): string {
  return (
    nama
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ApprovalList({
  requests,
  approveLeave,
  rejectLeave,
  initialSelectedId,
}: {
  requests: PendingLeaveRequest[];
  /** Preselect a request, e.g. when arriving from the dashboard card. */
  initialSelectedId?: string;
  approveLeave: (requestId: string, catatan: string | null) => Promise<ActionResult>;
  rejectLeave: (requestId: string, catatan: string) => Promise<ActionResult>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? requests[0]?.id ?? null);
  const [catatanByRequest, setCatatanByRequest] = useState<Record<string, string>>({});
  const [errorByRequest, setErrorByRequest] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        message="Tidak ada pengajuan cuti yang menunggu persetujuan."
      />
    );
  }

  // A decided request drops out of `requests` after revalidation; fall back to
  // the first remaining one so the detail panel never goes blank.
  const sel = requests.find((r) => r.id === selectedId) ?? requests[0];
  const catatan = catatanByRequest[sel.id] ?? "";
  const err = errorByRequest[sel.id];
  const busy = pendingId === sel.id;

  async function handleApprove(id: string) {
    setErrorByRequest((p) => ({ ...p, [id]: "" }));
    setPendingId(id);
    try {
      const r = await approveLeave(id, catatanByRequest[id]?.trim() || null);
      if (!r.ok) setErrorByRequest((p) => ({ ...p, [id]: r.error }));
    } finally {
      setPendingId(null);
    }
  }

  async function handleReject(id: string) {
    const note = (catatanByRequest[id] || "").trim();
    if (!note) {
      setErrorByRequest((p) => ({ ...p, [id]: "Catatan wajib diisi untuk menolak." }));
      return;
    }
    setErrorByRequest((p) => ({ ...p, [id]: "" }));
    setPendingId(id);
    try {
      const r = await rejectLeave(id, note);
      if (!r.ok) setErrorByRequest((p) => ({ ...p, [id]: r.error }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
      <ul
        aria-label="Pengajuan menunggu"
        className="flex flex-col overflow-hidden rounded-[18px] border border-border bg-card"
      >
        {requests.map((r) => {
          const on = r.id === sel.id;
          return (
            <li key={r.id} className="border-b border-hairline last:border-b-0">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "flex w-full flex-col gap-1.5 border-l-[3px] px-4.5 py-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  on ? "border-l-brand bg-field" : "border-l-transparent hover:bg-muted/50",
                )}
              >
                <span className="flex justify-between gap-2.5">
                  <span className="text-[0.95rem] font-semibold">{r.employeeName}</span>
                  <span className="flex items-center gap-2">
                    {r.review && r.review.clashes.length > 0 && (
                      <span className="rounded-full bg-warning px-2 py-0.5 text-[0.7rem] font-semibold text-warning-foreground">
                        Bentrok
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{durationOf(r).n} hr</span>
                  </span>
                </span>
                <span className="text-[0.8rem] text-muted-foreground">
                  {JENIS_LABELS[r.jenis] ?? r.jenis} · {formatRange(r.tanggalMulai, r.tanggalSelesai)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <section
        aria-label={`Detail pengajuan ${sel.employeeName}`}
        className="flex min-w-0 flex-col gap-5.5 rounded-[18px] border border-border bg-card p-6 lg:p-7"
      >
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="grid size-13 shrink-0 place-items-center rounded-full bg-secondary text-base font-semibold"
          >
            {initials(sel.employeeName)}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[1.375rem] font-semibold tracking-[-0.01em]">{sel.employeeName}</span>
            {sel.meta && <span className="text-sm text-muted-foreground">{sel.meta}</span>}
          </span>
        </div>

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px overflow-hidden rounded-[14px] border border-border bg-border">
          {[
            ["Jenis", JENIS_LABELS[sel.jenis] ?? sel.jenis],
            ["Tanggal", formatRange(sel.tanggalMulai, sel.tanggalSelesai)],
            [
              "Durasi",
              `${durationOf(sel).n} hari${durationOf(sel).working ? " kerja" : ""}`,
            ],
            ...(sel.review
              ? [
                  [
                    `Sisa saldo${sel.review.balance ? ` ${sel.review.balance.tahun}` : ""}`,
                    balanceText(sel.review),
                  ],
                ]
              : []),
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 bg-field px-4 py-3.5">
              <dt className="text-[0.8rem] text-muted-foreground">{k}</dt>
              <dd className="text-[0.95rem] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        {sel.review?.balance && sel.review.chargedDays != null && (
          <p
            className={cn(
              "rounded-[10px] px-3.5 py-3 text-sm leading-relaxed",
              sel.review.chargedDays > sel.review.balance.sisa
                ? "bg-danger text-danger-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {sel.review.chargedDays > sel.review.balance.sisa
              ? `Saldo tidak cukup: disetujui akan memotong ${sel.review.chargedDays} hari, sisa ${sel.review.balance.sisa} hari. Persetujuan akan ditolak sistem.`
              : `Disetujui akan memotong ${sel.review.chargedDays} hari dari saldo (dihitung hari kalender) — sisa menjadi ${sel.review.balance.sisa - sel.review.chargedDays} hari.`}
          </p>
        )}

        {sel.review && sel.review.clashes.length > 0 && (
          <p role="note" className="rounded-[10px] bg-warning px-3.5 py-3 text-sm leading-relaxed text-warning-foreground">
            {clashText(sel.review)}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[0.8rem] font-semibold">Alasan karyawan</span>
          <p className="max-w-[60ch] text-base leading-relaxed">
            {sel.alasan ? `“${sel.alasan}”` : <span className="text-muted-foreground">Tidak ada alasan.</span>}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`catatan-${sel.id}`}>Catatan untuk karyawan</Label>
          <Textarea
            id={`catatan-${sel.id}`}
            rows={3}
            placeholder="Opsional saat menyetujui · wajib diisi untuk menolak"
            aria-invalid={err ? true : undefined}
            value={catatan}
            onChange={(e) => setCatatanByRequest((p) => ({ ...p, [sel.id]: e.target.value }))}
          />
          {err && (
            <p role="alert" className="text-[0.8rem] text-destructive">
              {err}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button type="button" className="h-11 px-5.5" disabled={busy} onClick={() => handleApprove(sel.id)}>
            Setujui
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 border-destructive px-5 text-destructive hover:bg-danger hover:text-destructive"
            disabled={busy}
            onClick={() => handleReject(sel.id)}
          >
            Tolak
          </Button>
        </div>
      </section>
    </div>
  );
}
