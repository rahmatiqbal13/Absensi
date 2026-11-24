"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Link2, LoaderCircle, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { suggestEmployee } from "@/lib/mesin/suggest";
import type { PinEmployee } from "./mesin-import";

type SetPin = (employeeId: string, pin: string) => Promise<{ ok: true; diproses: number } | { ok: false; error: string }>;
type Request = () => Promise<{ ok: true } | { ok: false; error: string }>;

export type PullJob = {
  /** menunggu: bridge hasn't picked it up · dikirim: at the machine · selesai / gagal / kedaluwarsa */
  tahap: "menunggu" | "dikirim" | "selesai" | "gagal" | "kedaluwarsa";
  dibuat: string;
  kodeBalasan: string | null;
  /** Follow-up GET_USER_INFO questions (one per PIN), when the list had no names. */
  rinci: { total: number; selesai: number };
};
export type MachineUser = { pin: string; nama: string | null };

const waktuFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

/** "Tarik data pegawai dari mesin" + who the machine knows, matched to employees. */
export function MachineUsers({
  job,
  users,
  employees,
  request,
  setPin,
}: {
  job: PullJob | null;
  users: MachineUser[];
  employees: PinEmployee[];
  request: Request;
  setPin: SetPin;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const running = job?.tahap === "menunggu" || job?.tahap === "dikirim";

  // The machine answers on its own heartbeat; refresh until it has.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [running, router]);

  const byPin = new Map(employees.filter((e) => e.pin).map((e) => [e.pin as string, e]));
  const free = employees.filter((e) => !e.pin);
  const unlinked = users.filter((u) => !byPin.has(u.pin));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold">Pegawai terdaftar di mesin</p>
          <JobStatus job={job} />
        </div>
        <Button
          type="button"
          disabled={pending || running}
          onClick={() =>
            startTransition(async () => {
              const r = await request();
              if (!r.ok) return void toast.error(r.error);
              toast.success("Permintaan dikirim. Mesin membalas lewat jembatan dalam beberapa detik.");
              router.refresh();
            })
          }
        >
          {running ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserRoundSearch className="size-4" aria-hidden="true" />
          )}
          {running ? "Menarik data…" : "Tarik data pegawai dari mesin"}
        </Button>
      </div>

      {users.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Pengguna di mesin absensi dan pegawai yang dipasangkan</caption>
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">PIN</th>
                <th className="px-3 py-2 font-semibold">Nama di mesin</th>
                <th className="px-3 py-2 font-semibold">Pegawai di aplikasi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const linked = byPin.get(u.pin);
                return (
                  <tr key={u.pin} className="border-t border-border">
                    <td className="px-3 py-2 font-mono font-semibold">{u.pin}</td>
                    <td className="px-3 py-2">{u.nama ?? <span className="text-muted-foreground">tanpa nama</span>}</td>
                    <td className="px-3 py-2">
                      {linked ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> {linked.nama}
                        </span>
                      ) : (
                        <LinkRow key={`${u.pin}:${free.length}`} user={u} free={free} setPin={setPin} onLinked={() => router.refresh()} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {users.length > 0 && (
        <p className="text-muted-foreground">
          {users.length} pengguna di mesin · {users.length - unlinked.length} sudah dipasangkan
          {unlinked.length ? ` · ${unlinked.length} belum` : ""}. Memasangkan PIN langsung memasukkan scan tersimpan ke absensi.
        </p>
      )}
    </div>
  );
}

function JobStatus({ job }: { job: PullJob | null }) {
  if (!job) return <p className="text-muted-foreground">Belum pernah ditarik. Butuh jembatan mesin yang aktif di jaringan kantor.</p>;
  const when = waktuFmt.format(new Date(job.dibuat));
  const progress = job.rinci.total ? ` (${job.rinci.selesai} dari ${job.rinci.total} pegawai dibaca)` : "";
  switch (job.tahap) {
    case "menunggu":
      return <p className="text-muted-foreground">Menunggu jembatan mengambil perintah…</p>;
    case "dikirim":
      return <p className="text-muted-foreground">Perintah di mesin, menunggu balasan{progress}…</p>;
    case "selesai":
      return (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Badge variant="success">Selesai</Badge> Ditarik {when}
          {progress}
        </p>
      );
    case "gagal":
      return (
        <p className="flex flex-wrap items-center gap-2 text-warning-foreground">
          <CircleAlert className="size-4" aria-hidden="true" /> Mesin menolak perintah
          {job.kodeBalasan ? <span className="font-mono">({job.kodeBalasan})</span> : null}. Cek log jembatan; impor file tetap bisa dipakai.
        </p>
      );
    case "kedaluwarsa":
      return (
        <p className="flex flex-wrap items-center gap-2 text-warning-foreground">
          <CircleAlert className="size-4" aria-hidden="true" /> Tidak ada balasan sejak {when}. Pastikan jembatan berjalan dan mesin
          terhubung, lalu coba lagi.
        </p>
      );
  }
}

function LinkRow({ user, free, setPin, onLinked }: { user: MachineUser; free: PinEmployee[]; setPin: SetPin; onLinked: () => void }) {
  const [choice, setChoice] = useState(() => (user.nama ? suggestEmployee(user.nama, free)?.id ?? "" : ""));
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-60">
        <NativeSelect aria-label={`Pegawai untuk PIN ${user.pin}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
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
            const r = await setPin(choice, user.pin);
            if (!r.ok) return void toast.error(r.error);
            toast.success(`PIN ${user.pin} dipasangkan${r.diproses ? `, ${r.diproses} hari absensi dimasukkan` : ""}.`);
            onLinked();
          })
        }
      >
        <Link2 className="size-4" aria-hidden="true" /> Pasangkan
      </Button>
    </div>
  );
}
