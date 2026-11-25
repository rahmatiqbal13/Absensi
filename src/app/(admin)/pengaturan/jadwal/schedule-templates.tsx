"use client";

import { useState, useTransition } from "react";
import { Building2, CalendarClock, Plus, Users, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { summarizeSchedule, type TemplateUsage } from "@/lib/schedule/templates";
import { ScheduleForm, type ScheduleDefaults } from "./schedule-form";

type Result = { ok: true } | { ok: false; error: string };

export type Template = { id: string; nama: string; schedule: NonNullable<ScheduleDefaults>; usage: TemplateUsage };
export type Branch = { id: string; nama: string };
export type Department = { id: string; nama: string; branchId: string };
export type Staff = { id: string; nama: string; branchId: string; departmentId: string | null };
type Targets = { branchIds: string[]; departmentIds: string[]; employeeIds: string[] };

/**
 * Satu menu jadwal kerja (0067): every jadwal once, with where it applies.
 * Priority for an employee: their own jadwal > their department's > their
 * branch's jadwal utama; a shift roster overrides per date.
 */
export function ScheduleTemplates({
  templates,
  branches,
  departments,
  staff,
  saveTemplate,
  setTemplateTargets,
  deleteTemplate,
}: {
  templates: Template[];
  branches: Branch[];
  departments: Department[];
  staff: Staff[];
  saveTemplate: (templateId: string | null, fd: FormData) => Promise<Result>;
  setTemplateTargets: (templateId: string, targets: Targets) => Promise<Result>;
  deleteTemplate: (templateId: string) => Promise<Result>;
}) {
  const [editing, setEditing] = useState<string | null>(null); // template id, or "new"
  const branchName = new Map(branches.map((b) => [b.id, b.nama]));
  const deptLabel = new Map(departments.map((d) => [d.id, `${d.nama} (${branchName.get(d.branchId) ?? "?"})`]));
  const staffName = new Map(staff.map((e) => [e.id, e.nama]));
  // Who holds each target now, to show "pindah dari …" in the dialog.
  const owner = { branch: new Map<string, Template>(), dept: new Map<string, Template>(), emp: new Map<string, Template>() };
  for (const t of templates) {
    t.usage.branchIds.forEach((id) => owner.branch.set(id, t));
    t.usage.departmentIds.forEach((id) => owner.dept.set(id, t));
    t.usage.employeeIds.forEach((id) => owner.emp.set(id, t));
  }

  const nameField = (id: string, value?: string) => (
    <Field id={`nama-${id}`} label="Nama jadwal" hint="Mis. Kantor Sen–Jum, Unit Usaha Sel–Min, Kolam Renang.">
      <Input name="nama" defaultValue={value} required maxLength={60} className="h-11.5 max-w-80" />
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      {editing === "new" ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Jadwal baru</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} aria-label="Batal">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <ScheduleForm
              branchId="new"
              formKey="new"
              label="baru"
              defaults={null}
              leading={nameField("new")}
              saveSchedule={async (_b, _d, fd) => {
                const r = await saveTemplate(null, fd);
                if (r.ok) {
                  toast.success("Jadwal dibuat. Tentukan cabang / departemen / pegawainya lewat tombol Berlaku untuk.");
                  setEditing(null);
                }
                return r;
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Button type="button" className="self-start" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden="true" /> Buat jadwal
        </Button>
      )}

      {templates.length === 0 && editing !== "new" && (
        <p className="text-sm text-muted-foreground">Belum ada jadwal. Buat satu, lalu tentukan berlaku untuk siapa.</p>
      )}

      <ul className="flex flex-col gap-3">
        {templates.map((t) => {
          const u = t.usage;
          const unused = !u.branchIds.length && !u.departmentIds.length && !u.employeeIds.length;
          return (
            <li key={t.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
                        {t.nama}
                        {unused && <Badge variant="neutral">Tidak dipakai</Badge>}
                      </p>
                      <p className="font-mono text-[0.85rem]">
                        {summarizeSchedule(t.schedule)} · toleransi {t.schedule.toleransiMenit} menit
                      </p>
                      <TargetLine icon={Building2} label="Cabang" items={u.branchIds.map((id) => branchName.get(id) ?? "?")} />
                      <TargetLine icon={Workflow} label="Departemen" items={u.departmentIds.map((id) => deptLabel.get(id) ?? "?")} />
                      <TargetLine icon={Users} label="Pegawai" items={u.employeeIds.map((id) => staffName.get(id) ?? "?")} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TargetsDialog
                        template={t}
                        branches={branches}
                        departments={departments}
                        staff={staff}
                        branchName={branchName}
                        owner={owner}
                        save={(targets) => setTemplateTargets(t.id, targets)}
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                        {editing === t.id ? "Tutup" : "Ubah jam"}
                      </Button>
                      <ConfirmDeleteButton
                        action={() => deleteTemplate(t.id)}
                        title={`Hapus jadwal "${t.nama}"?`}
                        description="Departemen dan pegawai yang memakainya kembali ke jadwal utama cabangnya. Absensi yang sudah tercatat tidak berubah."
                      />
                    </div>
                  </div>
                  {editing === t.id && (
                    <ScheduleForm
                      branchId={t.id}
                      formKey={t.id}
                      label={t.nama}
                      defaults={t.schedule}
                      leading={nameField(t.id, t.nama)}
                      saveSchedule={(_b, _d, fd) => saveTemplate(t.id, fd)}
                    />
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TargetLine({ icon: Icon, label, items }: { icon: typeof Users; label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">{label}:</span> {items.join(", ")}
      </span>
    </p>
  );
}

function TargetsDialog({
  template,
  branches,
  departments,
  staff,
  branchName,
  owner,
  save,
}: {
  template: Template;
  branches: Branch[];
  departments: Department[];
  staff: Staff[];
  branchName: Map<string, string>;
  owner: { branch: Map<string, Template>; dept: Map<string, Template>; emp: Map<string, Template> };
  save: (targets: Targets) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [b, setB] = useState(new Set(template.usage.branchIds));
  const [d, setD] = useState(new Set(template.usage.departmentIds));
  const [e, setE] = useState(new Set(template.usage.employeeIds));
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const shownStaff = staff.filter((s) => s.nama.toLowerCase().includes(q.trim().toLowerCase()));
  const total = template.usage.branchIds.length + template.usage.departmentIds.length + template.usage.employeeIds.length;

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    setter(next);
  };
  const from = (holder: Template | undefined, checked: boolean) =>
    holder && holder.id !== template.id ? (
      <Badge variant="neutral">{checked ? `pindah dari ${holder.nama}` : holder.nama}</Badge>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setB(new Set(template.usage.branchIds));
          setD(new Set(template.usage.departmentIds));
          setE(new Set(template.usage.employeeIds));
          setQ("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Users className="size-4" aria-hidden="true" /> Berlaku untuk ({total})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>&quot;{template.nama}&quot; berlaku untuk</DialogTitle>
          <DialogDescription>
            Bila seseorang terkena lebih dari satu jadwal, yang dipakai: jadwal pegawainya sendiri, lalu jadwal departemennya,
            lalu jadwal utama cabangnya. Roster shift harian tetap didahulukan bila ada.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col">
          <legend className="mb-1 text-sm font-semibold">Jadwal utama cabang</legend>
          <p className="mb-1 text-xs text-muted-foreground">
            Setiap cabang punya tepat satu jadwal utama. Untuk memindahkan cabang, centang di jadwal tujuannya.
          </p>
          {branches.map((br) => {
            const mine = template.usage.branchIds.includes(br.id);
            return (
              <CheckRow
                key={br.id}
                label={br.nama}
                checked={b.has(br.id)}
                disabled={mine}
                onChange={(on) => toggle(b, setB, br.id, on)}
                extra={from(owner.branch.get(br.id), b.has(br.id))}
              />
            );
          })}
        </fieldset>

        {departments.length > 0 && (
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-sm font-semibold">Departemen</legend>
            <p className="mb-1 text-xs text-muted-foreground">Hanya bila departemen ini jam kerjanya beda dari cabangnya.</p>
            {departments.map((dp) => (
              <CheckRow
                key={dp.id}
                label={dp.nama}
                sub={branchName.get(dp.branchId)}
                checked={d.has(dp.id)}
                onChange={(on) => toggle(d, setD, dp.id, on)}
                extra={from(owner.dept.get(dp.id), d.has(dp.id))}
              />
            ))}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold">Pegawai tertentu</legend>
          <Input placeholder="Cari nama…" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Cari pegawai" />
          <div className="flex flex-col">
            {shownStaff.map((s) => (
              <CheckRow
                key={s.id}
                label={s.nama}
                sub={branchName.get(s.branchId)}
                checked={e.has(s.id)}
                onChange={(on) => toggle(e, setE, s.id, on)}
                extra={from(owner.emp.get(s.id), e.has(s.id))}
              />
            ))}
          </div>
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await save({ branchIds: [...b], departmentIds: [...d], employeeIds: [...e] });
                if (!r.ok) return void toast.error(r.error);
                toast.success(`Jadwal "${template.nama}" diperbarui.`);
                setOpen(false);
              })
            }
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckRow({
  label,
  sub,
  checked,
  disabled,
  onChange,
  extra,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  extra?: React.ReactNode;
}) {
  return (
    <label className={`flex min-h-11 items-center gap-3 border-t border-hairline text-sm ${disabled ? "" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(ev) => onChange(ev.target.checked)}
        className="size-4 accent-primary"
      />
      <span className="min-w-0 flex-1 truncate">
        {label}
        {sub && <span className="text-muted-foreground"> · {sub}</span>}
      </span>
      {extra}
    </label>
  );
}
