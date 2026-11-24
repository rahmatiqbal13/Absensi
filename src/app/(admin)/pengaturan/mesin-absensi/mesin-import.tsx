"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, FileUp, Link2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import type { AttendanceStatus } from "@/lib/attendance/status";
import { formatJamWib } from "@/lib/laporan/employee-daily";
import { suggestEmployee } from "@/lib/mesin/suggest";
import type { DayOutcome } from "@/lib/mesin/apply-scans";
import type { MachineImportResult } from "./actions";

type Action = (formData: FormData) => Promise<MachineImportResult>;
type SetPin = (employeeId: string, pin: string) => Promise<{ ok: true; diproses: number } | { ok: false; error: string }>;
export type PinEmployee = { id: string; nama: string; pin: string | null };

const AKSI: Record<DayOutcome["aksi"], { label: string; variant: "success" | "info" | "neutral" | "warning" }> = {
  baru: { label: "Baru", variant: "success" },
  ubah: { label: "Diperbarui", variant: "info" },
  tetap: { label: "Sudah sama", variant: "neutral" },
  lewati: { label: "Dilewati", variant: "warning" },
};

const tanggalFmt = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export function MesinImport({
  preview,
  run,
  setPin,
  employees,
}: {
  preview: Action;
  run: Action;
  setPin: SetPin;
  employees: PinEmployee[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Extract<MachineImportResult, { ok: true }> | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (action: Action, f: File, after?: () => void) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const r = await action(fd);
      if (r.ok) {
        setResult(r);
        after?.();
      } else setError(r.error);
    });

  function onFile(f: File | undefined) {
    setError(null);
    setResult(null);
    setDone(false);
    setFile(f ?? null);
    if (f) send(preview, f);
  }

  const days = result?.days ?? [];
  const toWrite = days.filter((d) => d.aksi === "baru" || d.aksi === "ubah").length;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <label htmlFor="mesin-file" className="flex items-center gap-2 text-sm font-semibold">
          <FileUp className="size-4" aria-hidden="true" /> Pilih file log dari mesin
        </label>
        <Input id="mesin-file" type="file" accept=".txt,.dat,.log,text/plain" disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">
          Di mesin: menu USB / Flashdisk → Download log absensi (GLog). Biasanya bernama <span className="font-mono">AGL001.TXT</span>. Maks 1 MB.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {pending && !result && <p className="text-sm text-muted-foreground">Membaca file…</p>}

      {result && (
        <>
          {done ? (
            <Alert>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <AlertDescription>
                Impor selesai: {result.ditulis} hari absensi ditulis, {result.scanBaru} scan baru disimpan
                {result.scanTotal - result.scanBaru > 0 ? ` (${result.scanTotal - result.scanBaru} scan sudah pernah diimpor)` : ""}.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm">
              <b>{result.scanTotal}</b> scan terbaca
              {result.barisDilewati ? `, ${result.barisDilewati} baris tidak dikenali` : ""} → <b>{days.length}</b> hari absensi,{" "}
              <b>{toWrite}</b> akan ditulis.
            </p>
          )}

          {result.unmapped.length > 0 && (
            <UnmappedPins
              unmapped={result.unmapped}
              employees={employees}
              setPin={setPin}
              onLinked={() => file && send(done ? run : preview, file)}
            />
          )}

          <DayTable days={days} />

          {!done && (
            <Button
              disabled={pending || toWrite === 0 || !file}
              onClick={() => file && send(run, file, () => setDone(true))}
            >
              <Upload className="size-4" aria-hidden="true" />
              {pending ? "Mengimpor…" : `Impor ${toWrite} hari absensi`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function UnmappedPins({
  unmapped,
  employees,
  setPin,
  onLinked,
}: {
  unmapped: { pin: string; namaMesin: string; jumlahScan: number }[];
  employees: PinEmployee[];
  setPin: SetPin;
  onLinked: () => void;
}) {
  const free = employees.filter((e) => !e.pin);
  return (
    <div className="space-y-3 rounded-xl border border-warning-foreground/30 bg-warning/40 p-4">
      <p className="text-sm">
        <b>{unmapped.length} PIN di mesin belum dipasangkan ke pegawai.</b> Scan mereka belum bisa dimasukkan. Pilih pegawainya
        lalu Simpan; pratinjau akan diperbarui.
      </p>
      <ul className="space-y-2">
        {unmapped.map((u) => (
          <UnmappedRow key={u.pin} u={u} free={free} setPin={setPin} onLinked={onLinked} />
        ))}
      </ul>
    </div>
  );
}

function UnmappedRow({
  u,
  free,
  setPin,
  onLinked,
}: {
  u: { pin: string; namaMesin: string; jumlahScan: number };
  free: PinEmployee[];
  setPin: SetPin;
  onLinked: () => void;
}) {
  const [choice, setChoice] = useState(() => suggestEmployee(u.namaMesin, free)?.id ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3">
      <span className="min-w-48 text-sm">
        PIN <span className="font-mono font-semibold">{u.pin}</span> · {u.namaMesin || "tanpa nama"}{" "}
        <span className="text-muted-foreground">({u.jumlahScan} scan)</span>
      </span>
      <div className="w-64">
        <NativeSelect aria-label={`Pegawai untuk PIN ${u.pin}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Pilih pegawai…</option>
          {free.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nama}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!choice || pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setPin(choice, u.pin);
            if (r.ok) {
              toast.success(`PIN ${u.pin} dipasangkan.`);
              onLinked();
            } else toast.error(r.error);
          })
        }
      >
        <Link2 className="size-4" aria-hidden="true" /> Simpan
      </Button>
    </li>
  );
}

function DayTable({ days }: { days: DayOutcome[] }) {
  if (days.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Hasil per hari</caption>
        <thead className="bg-muted text-left">
          <tr>
            <th className="px-3 py-2 font-semibold">Pegawai</th>
            <th className="px-3 py-2 font-semibold">Tanggal</th>
            <th className="px-3 py-2 font-semibold">Scan di mesin</th>
            <th className="px-3 py-2 font-semibold">Masuk</th>
            <th className="px-3 py-2 font-semibold">Pulang</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Hasil</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={`${d.employeeId}|${d.tanggal}`} className="border-t border-border">
              <td className="px-3 py-2">{d.nama}</td>
              <td className="px-3 py-2 whitespace-nowrap">{tanggalFmt.format(new Date(`${d.tanggal}T00:00:00Z`))}</td>
              <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                {d.scans.map((s) => formatJamWib(s)).join(", ")}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums">{formatJamWib(d.jamMasuk)}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{formatJamWib(d.jamPulang)}</td>
              <td className="px-3 py-2">{d.status ? <AttendanceStatusBadge status={d.status as AttendanceStatus} /> : "—"}</td>
              <td className="px-3 py-2">
                <Badge variant={AKSI[d.aksi].variant}>{AKSI[d.aksi].label}</Badge>
                {d.alasan && <span className="ml-2 text-xs text-muted-foreground">{d.alasan}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
