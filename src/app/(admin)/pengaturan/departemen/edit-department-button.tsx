"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Result = { ok: true } | { ok: false; error: string };

/** "Ubah" on a department row: rename it, or (when empty) move it to another branch. */
export function EditDepartmentButton({
  department,
  branches,
  headcount,
  updateDepartment,
}: {
  department: { id: string; nama: string; branchId: string };
  branches: { id: string; nama: string }[];
  /** Active members; a department with members cannot change branch. */
  headcount: number | null;
  updateDepartment: (fd: FormData) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = headcount !== null && headcount > 0;
  const id = `dept-edit-${department.id}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Ubah departemen ${department.nama}`}>
          <Pencil className="size-4" aria-hidden="true" /> Ubah
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah departemen</DialogTitle>
          <DialogDescription>Nama baru langsung terlihat di data karyawan, laporan, dan filter.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          action={(fd) => {
            setError(null);
            if (locked) fd.set("branchId", department.branchId);
            startTransition(async () => {
              const r = await updateDepartment(fd);
              if (!r.ok) return setError(r.error);
              toast.success("Departemen diperbarui.");
              setOpen(false);
            });
          }}
        >
          <Field id={`${id}-nama`} label="Nama departemen">
            <Input name="nama" defaultValue={department.nama} required maxLength={100} autoFocus />
          </Field>
          <Field
            id={`${id}-cabang`}
            label="Cabang"
            hint={locked ? `Tidak bisa dipindah: masih ada ${headcount} karyawan di departemen ini.` : undefined}
          >
            <NativeSelect name="branchId" defaultValue={department.branchId} disabled={locked}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nama}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
