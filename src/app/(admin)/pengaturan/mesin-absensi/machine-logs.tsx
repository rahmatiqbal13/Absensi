"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, History, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type LogJob = {
  tahap: "berjalan" | "selesai" | "gagal" | "kedaluwarsa";
  dibuat: string;
  /** Months asked for, months answered (incl. skipped when the machine sent everything at once). */
  bulan: { total: number; selesai: number };
  /** Scans the machine returned (they reach attendance via the bridge's scan queue). */
  scan: number;
  dari: string | null;
  sampai: string | null;
  kodeBalasan: string | null;
};

type Request = (dari: string, sampai: string) => Promise<{ ok: true; bulan: number } | { ok: false; error: string }>;

const waktuFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const tanggalFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });
const fmtDate = (wall: string) => tanggalFmt.format(new Date(`${wall.slice(0, 10)}T00:00:00Z`));

/** Pulls the machine's whole attendance log for a date range, month by month. */
export function MachineLogs({ job, defaultDari, defaultSampai, request }: { job: LogJob | null; defaultDari: string; defaultSampai: string; request: Request }) {
  const router = useRouter();
  const [dari, setDari] = useState(defaultDari);
  const [sampai, setSampai] = useState(defaultSampai);
  const [pending, startTransition] = useTransition();
  const running = job?.tahap === "berjalan";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="space-y-1">
        <p className="font-semibold">Tarik semua absen dari mesin</p>
        <p className="text-muted-foreground">
          Mengambil seluruh log absen yang tersimpan di mesin untuk rentang tanggal ini, per bulan. Scan yang sudah pernah masuk
          diabaikan, koreksi HR tidak ditimpa, dan bulan yang payroll-nya final tidak diubah — aman diulang kapan saja.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await request(dari, sampai);
            if (!r.ok) return void toast.error(r.error);
            toast.success(`Permintaan ${r.bulan} bulan dikirim. Mesin memprosesnya satu per satu (sekitar 20 detik per bulan).`);
            router.refresh();
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[0.8rem] font-semibold">Dari tanggal</span>
          <Input type="date" value={dari} max={sampai} onChange={(e) => setDari(e.target.value)} className="h-9 w-44" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.8rem] font-semibold">Sampai tanggal</span>
          <Input type="date" value={sampai} min={dari} max={defaultSampai} onChange={(e) => setSampai(e.target.value)} className="h-9 w-44" required />
        </label>
        <Button type="submit" disabled={pending || running}>
          {running ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <History className="size-4" aria-hidden="true" />}
          {running ? "Menarik absen…" : "Tarik semua absen dari mesin"}
        </Button>
      </form>
      <LogStatus job={job} />
    </div>
  );
}

function LogStatus({ job }: { job: LogJob | null }) {
  if (!job) return <p className="text-muted-foreground">Belum pernah ditarik.</p>;
  const range = job.dari && job.sampai ? ` (${fmtDate(job.dari)} – ${fmtDate(job.sampai)})` : "";
  const scans = `${job.scan.toLocaleString("id-ID")} scan diterima${range}`;
  switch (job.tahap) {
    case "berjalan":
      return (
        <p className="text-muted-foreground">
          Memproses bulan {Math.min(job.bulan.selesai + 1, job.bulan.total)} dari {job.bulan.total} · {scans}…
        </p>
      );
    case "selesai":
      return (
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <Badge variant="success">Selesai</Badge> Ditarik {waktuFmt.format(new Date(job.dibuat))} · {scans}. Absensi diperbarui dalam
          beberapa detik setelah jembatan mengirimkannya.
        </p>
      );
    case "gagal":
      return (
        <p className="flex flex-wrap items-center gap-2 text-warning-foreground">
          <CircleAlert className="size-4" aria-hidden="true" /> Mesin menolak permintaan log
          {job.kodeBalasan ? <span className="font-mono">({job.kodeBalasan})</span> : null}. Impor file dari flashdisk tetap bisa dipakai.
        </p>
      );
    case "kedaluwarsa":
      return (
        <p className="flex flex-wrap items-center gap-2 text-warning-foreground">
          <CircleAlert className="size-4" aria-hidden="true" /> Berhenti di bulan {job.bulan.selesai} dari {job.bulan.total} ({scans}).
          Pastikan jembatan berjalan, lalu tarik lagi — yang sudah masuk tidak terduplikasi.
        </p>
      );
  }
}
