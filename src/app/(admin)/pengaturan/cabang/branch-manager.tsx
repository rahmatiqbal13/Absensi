"use client";

import { useRef, useState } from "react";
import { Building, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResponsiveTable } from "@/components/responsive-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { cn } from "@/lib/utils";

export type BranchRow = {
  id: string;
  nama: string;
  alamat: string | null;
  lat: number;
  long: number;
  radius: number;
  employeeCount: number;
  departmentCount: number;
};

type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type Result = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Terjadi kesalahan. Coba lagi.";

export function BranchManager({
  branches,
  createBranch,
  updateBranch,
  deleteBranch,
}: {
  branches: BranchRow[];
  createBranch: (fd: FormData) => Promise<CreateResult>;
  updateBranch: (id: string, fd: FormData) => Promise<Result>;
  deleteBranch: (id: string) => Promise<Result>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function addAction(fd: FormData) {
    setError(null);
    setBusy(true);
    try {
      const r = await createBranch(fd);
      if (r.ok) {
        toast.success("Cabang ditambahkan.");
        formRef.current?.reset();
      } else {
        setError(r.error);
      }
    } catch (e) {
      console.error(e);
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function editAction(fd: FormData) {
    if (!editing) return;
    setEditError(null);
    setEditBusy(true);
    try {
      const r = await updateBranch(editing.id, fd);
      if (r.ok) {
        toast.success("Perubahan disimpan.");
        setEditing(null);
      } else {
        setEditError(r.error);
      }
    } catch (e) {
      console.error(e);
      setEditError(GENERIC_ERROR);
    } finally {
      setEditBusy(false);
    }
  }

  async function remove(id: string) {
    return deleteBranch(id);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <form ref={formRef} action={addAction} className="flex flex-wrap items-end gap-3">
            <Field id="nama" label="Nama Cabang">
              <Input name="nama" />
            </Field>
            <Field id="alamat" label="Alamat">
              <Input name="alamat" />
            </Field>
            <Button type="submit" disabled={busy}>Tambah Cabang</Button>
            {error && (
              <Alert variant="destructive" className="w-full">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      <ResponsiveTable
        columns={[
          { key: "nama", header: "Nama", cell: (r: BranchRow) => r.nama },
          {
            key: "alamat",
            header: "Alamat",
            mobileLabel: "Alamat",
            cell: (r: BranchRow) => r.alamat ?? "—",
          },
          {
            key: "geofence",
            header: "Geofence",
            mobileLabel: "Geofence",
            cell: (r: BranchRow) => {
              const configured = !(r.lat === 0 && r.long === 0);
              return (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    configured
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  )}
                >
                  {configured ? "Aktif" : "Belum diatur"}
                </span>
              );
            },
          },
          {
            key: "aksi",
            header: "Aksi",
            align: "right",
            cell: (r: BranchRow) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                  <Pencil className="size-4" /> Ubah
                </Button>
                <ConfirmDeleteButton
                  action={remove.bind(null, r.id)}
                  title="Hapus cabang?"
                  description={`Cabang "${r.nama}" akan dihapus beserta jadwal kerja & hari libur khususnya. Cabang yang masih dipakai karyawan/departemen akan menolak penghapusan.`}
                />
              </div>
            ),
          },
        ]}
        rows={branches}
        rowKey={(r) => r.id}
        caption="Daftar cabang"
        emptyState={<EmptyState icon={Building} message="Belum ada cabang." />}
      />

      <p className="text-xs text-muted-foreground">
        Titik &amp; radius kantor diatur di menu Lokasi Kantor.
      </p>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Cabang</DialogTitle>
          </DialogHeader>
          {editing && (
            <form key={editing.id} action={editAction} className="space-y-4">
              <Field id="edit-nama" label="Nama Cabang">
                <Input name="nama" defaultValue={editing.nama} />
              </Field>
              <Field id="edit-alamat" label="Alamat">
                <Input name="alamat" defaultValue={editing.alamat ?? ""} />
              </Field>
              {editError && (
                <Alert variant="destructive">
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="submit" disabled={editBusy}>Simpan</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
