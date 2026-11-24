"use client";

import { useState, useTransition } from "react";
import { Plus, UserRoundCog, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ScheduleForm, type ScheduleDefaults } from "./schedule-form";
import { summarizeSchedule } from "./branch-schedule-card";

type Result = { ok: true } | { ok: false; error: string };

export type CustomSchedule = {
  id: string;
  nama: string;
  schedule: NonNullable<ScheduleDefaults>;
  memberIds: string[];
};

/**
 * Jadwal khusus of one branch (0065): named schedules for the few people who
 * work other hours than their department, each assigned to chosen employees.
 */
export function CustomSchedules({
  branchId,
  branchNama,
  schedules,
  employees,
  saveCustomSchedule,
  deleteCustomSchedule,
  setCustomScheduleMembers,
}: {
  branchId: string;
  branchNama: string;
  schedules: CustomSchedule[];
  /** Active employees of the branch, with the jadwal khusus they follow now. */
  employees: { id: string; nama: string; departemen: string | null; scheduleId: string | null }[];
  saveCustomSchedule: (branchId: string, scheduleId: string | null, fd: FormData) => Promise<Result>;
  deleteCustomSchedule: (scheduleId: string) => Promise<Result>;
  setCustomScheduleMembers: (scheduleId: string, employeeIds: string[]) => Promise<Result>;
}) {
  const [editing, setEditing] = useState<string | null>(null); // schedule id, or "new"
  const nameOf = new Map(schedules.map((s) => [s.id, s.nama]));

  const nameField = (id: string, value?: string) => (
    <Field id={`nama-${id}`} label="Nama jadwal khusus" hint="Mis. Pagi Lab, Satpam Malam, Setengah Hari.">
      <Input name="nama" defaultValue={value} required maxLength={60} className="h-11.5 max-w-80" />
    </Field>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jadwal khusus — {branchNama}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Untuk pegawai yang jam kerjanya berbeda dari departemennya. Pegawai yang dipilih mengikuti jadwal ini setiap hari
          kerja; roster shift harian tetap didahulukan bila ada.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {schedules.length === 0 && editing !== "new" && (
          <p className="text-sm text-muted-foreground">Belum ada jadwal khusus di cabang ini.</p>
        )}
        <ul className="flex flex-col">
          {schedules.map((s) => {
            const members = employees.filter((e) => s.memberIds.includes(e.id));
            return (
              <li key={s.id} className="flex flex-col gap-3 border-t border-hairline py-3 first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{s.nama}</p>
                    <p className="font-mono text-[0.8rem] text-muted-foreground">{summarizeSchedule(s.schedule)}</p>
                    <p className="text-sm text-muted-foreground">
                      {members.length ? members.map((m) => m.nama).join(", ") : "Belum ada pegawai."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MembersDialog
                      schedule={s}
                      employees={employees}
                      nameOf={nameOf}
                      setMembers={(ids) => setCustomScheduleMembers(s.id, ids)}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                      {editing === s.id ? "Tutup" : "Ubah jam"}
                    </Button>
                    <ConfirmDeleteButton
                      action={() => deleteCustomSchedule(s.id)}
                      title={`Hapus jadwal "${s.nama}"?`}
                      description={`${members.length} pegawai akan kembali mengikuti jadwal departemen / cabangnya. Absensi yang sudah tercatat tidak berubah.`}
                    />
                  </div>
                </div>
                {editing === s.id && (
                  <ScheduleForm
                    branchId={branchId}
                    formKey={s.id}
                    label={s.nama}
                    defaults={s.schedule}
                    leading={nameField(s.id, s.nama)}
                    saveSchedule={(b, _dept, fd) => saveCustomSchedule(b, s.id, fd)}
                  />
                )}
              </li>
            );
          })}
        </ul>

        {editing === "new" ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Jadwal khusus baru</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} aria-label="Batal">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <ScheduleForm
              branchId={branchId}
              formKey={`new-${branchId}`}
              label="khusus"
              defaults={null}
              leading={nameField(`new-${branchId}`)}
              saveSchedule={async (b, _dept, fd) => {
                const r = await saveCustomSchedule(b, null, fd);
                if (r.ok) {
                  toast.success("Jadwal khusus dibuat. Pilih pegawainya lewat tombol Pegawai.");
                  setEditing(null);
                }
                return r;
              }}
            />
          </div>
        ) : (
          <Button type="button" variant="outline" className="self-start" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" /> Tambah jadwal khusus
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MembersDialog({
  schedule,
  employees,
  nameOf,
  setMembers,
}: {
  schedule: CustomSchedule;
  employees: { id: string; nama: string; departemen: string | null; scheduleId: string | null }[];
  nameOf: Map<string, string>;
  setMembers: (ids: string[]) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set(schedule.memberIds));
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const shown = employees.filter((e) => e.nama.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setChosen(new Set(schedule.memberIds));
          setQ("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <UserRoundCog className="size-4" aria-hidden="true" /> Pegawai ({schedule.memberIds.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pegawai dengan jadwal &quot;{schedule.nama}&quot;</DialogTitle>
          <DialogDescription>
            Centang pegawai yang mengikuti jadwal ini. Yang tidak dicentang kembali ke jadwal departemen / cabangnya. Satu pegawai
            hanya bisa punya satu jadwal khusus.
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pegawai" />
        <ul className="flex flex-col">
          {shown.map((e) => {
            const other = e.scheduleId && e.scheduleId !== schedule.id ? nameOf.get(e.scheduleId) : null;
            return (
              <li key={e.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-hairline text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.has(e.id)}
                    onChange={(ev) =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (ev.target.checked) next.add(e.id);
                        else next.delete(e.id);
                        return next;
                      })
                    }
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {e.nama}
                    {e.departemen && <span className="text-muted-foreground"> · {e.departemen}</span>}
                  </span>
                  {other && <Badge variant="neutral">{chosen.has(e.id) ? `pindah dari ${other}` : other}</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await setMembers([...chosen]);
                if (!r.ok) return void toast.error(r.error);
                toast.success(`${chosen.size} pegawai mengikuti jadwal "${schedule.nama}".`);
                setOpen(false);
              })
            }
          >
            {pending ? "Menyimpan…" : `Simpan (${chosen.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
