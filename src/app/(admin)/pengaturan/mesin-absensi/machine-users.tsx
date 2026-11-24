"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Link2, LoaderCircle, Unlink, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { suggestEmployee } from "@/lib/mesin/suggest";
import type { PinEmployee } from "./mesin-import";
import type { SetPinResult } from "./actions";

type SetPin = (employeeId: string, pin: string) => Promise<SetPinResult>;
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
  // Unambiguous name matches, each employee claimed by at most one machine user.
  const matches = (() => {
    const picks = unlinked
      .map((u) => ({ u, e: u.nama ? suggestEmployee(u.nama, free) : null }))
      .filter((m): m is { u: MachineUser; e: PinEmployee } => !!m.e);
    const count = new Map<string, number>();
    for (const m of picks) count.set(m.e.id, (count.get(m.e.id) ?? 0) + 1);
    return picks.filter((m) => count.get(m.e.id) === 1);
  })();
  const [linking, startLinking] = useTransition();

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
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> {linked.nama}
                          </span>
                          <UnlinkButton user={u} employee={linked} setPin={setPin} onDone={() => router.refresh()} />
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
      {matches.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2">
          <span>
            {matches.length} nama di mesin cocok dengan pegawai yang belum punya PIN:{" "}
            {matches.map((m) => `${m.u.nama} → ${m.e.nama}`).join(", ")}.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={linking}
            onClick={() =>
              startLinking(async () => {
                let ok = 0;
                let hari = 0;
                for (const m of matches) {
                  const r = await setPin(m.e.id, m.u.pin);
                  if (r.ok) {
                    ok++;
                    hari += r.diproses;
                  } else toast.error(`PIN ${m.u.pin}: ${r.error}`);
                }
                if (ok) toast.success(`${ok} PIN dipasangkan${hari ? `, ${hari} hari absensi dimasukkan` : ""}.`);
                router.refresh();
              })
            }
          >
            <Link2 className="size-4" aria-hidden="true" /> {linking ? "Memasangkan…" : "Pasangkan semua yang cocok"}
          </Button>
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

/** Undoes a wrong pairing: frees the PIN and takes its scans back out of that employee's attendance. */
function UnlinkButton({
  user,
  employee,
  setPin,
  onDone,
}: {
  user: MachineUser;
  employee: PinEmployee;
  setPin: SetPin;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
          <Unlink className="size-4" aria-hidden="true" /> Lepaskan
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Lepaskan PIN {user.pin} dari {employee.nama}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Absen dari mesin untuk PIN ini dikeluarkan dari absensi {employee.nama}: hari yang hanya berisi scan mesin dihapus,
            jam dari aplikasi (GPS / QR) dan koreksi HR tetap. Scan-nya disimpan dan langsung masuk ke pegawai yang benar begitu
            PIN {user.pin} dipasangkan lagi. Bulan yang payroll-nya sudah final tidak diubah.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await setPin(employee.id, "");
                if (!r.ok) return void toast.error(r.error);
                const d = r.dilepas;
                const parts = d
                  ? [
                      d.hariDihapus ? `${d.hariDihapus} hari dihapus` : null,
                      d.hariDiubah ? `${d.hariDiubah} hari diperbarui` : null,
                      d.hariDilewati ? `${d.hariDilewati} hari tidak diubah (payroll final)` : null,
                    ].filter(Boolean)
                  : [];
                toast.success(`PIN ${user.pin} dilepas dari ${employee.nama}${parts.length ? `: ${parts.join(", ")}` : ""}.`);
                setOpen(false);
                onDone();
              });
            }}
          >
            {pending ? "Melepaskan…" : "Lepaskan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
