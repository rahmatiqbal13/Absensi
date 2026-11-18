"use client";

import { useState, useTransition } from "react";
import { FilePlus2, FileSignature, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTRACT_LABEL,
  addDays,
  formatLama,
  formatLamaHari,
  formatLamaKontrak,
  formatTanggal,
  sortContracts,
  summarizeContracts,
  type Contract,
  type ContractSummary,
} from "@/lib/employees/contracts";

type Result = { ok: true } | { ok: false; error: string };

export function ContractStateBadge({ summary }: { summary: ContractSummary }) {
  switch (summary.state) {
    case "tetap":
      return <Badge variant="success">Tetap</Badge>;
    case "aktif":
      return <Badge variant="success">Aktif · sisa {summary.sisaHari} hari</Badge>;
    case "segera_berakhir":
      return <Badge variant="warning">Berakhir {summary.sisaHari === 0 ? "hari ini" : `dalam ${summary.sisaHari} hari`}</Badge>;
    case "berakhir":
      return <Badge variant="danger">Berakhir {-summary.sisaHari!} hari lalu</Badge>;
    case "belum_mulai":
      return <Badge variant="info">Belum mulai</Badge>;
    default:
      return <Badge variant="neutral">Belum ada data kontrak</Badge>;
  }
}

/** HR view of an employee's contracts: current status, extensions, history, add / extend. */
export function ContractPanel({
  contracts,
  today,
  tanggalMulaiKerja,
  addContract,
  deleteContract,
}: {
  contracts: Contract[];
  today: string;
  tanggalMulaiKerja: string;
  addContract: (fd: FormData) => Promise<Result>;
  deleteContract: (contractId: string) => Promise<Result>;
}) {
  const summary = summarizeContracts(contracts, today);
  const history = sortContracts(contracts);
  const cur = summary.current;
  const canExtend = cur && cur.jenis !== "pkwtt" && cur.tanggal_selesai;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm">
              Mulai bekerja <b>{formatTanggal(tanggalMulaiKerja)}</b> · masa kerja{" "}
              <b>{tanggalMulaiKerja <= today ? formatLama(tanggalMulaiKerja, addDays(today, 1)) : "belum mulai"}</b>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ContractStateBadge summary={summary} />
              {cur && <span className="text-sm font-semibold">{CONTRACT_LABEL[cur.jenis]}</span>}
            </div>
            {cur ? (
              <p className="text-sm text-muted-foreground">
                {formatTanggal(cur.tanggal_mulai)} – {cur.tanggal_selesai ? formatTanggal(cur.tanggal_selesai) : "tanpa batas waktu"}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tambahkan kontrak supaya tanggal berakhirnya terpantau dan HR mendapat pengingat H-30 dan H-7.
              </p>
            )}
            {summary.kontrakKe > 0 && (
              <p className="text-sm">
                Kontrak PKWT ke-<b>{summary.kontrakKe}</b> · diperpanjang <b>{summary.perpanjangan}</b> kali · total masa PKWT{" "}
                <b>{formatLamaHari(summary.totalPkwtHari)}</b>
              </p>
            )}
          </div>
          <ContractDialog
            mode={canExtend ? "perpanjang" : "tambah"}
            defaultJenis={cur?.jenis ?? "pkwt"}
            defaultMulai={canExtend ? addDays(cur.tanggal_selesai!, 1) : tanggalMulaiKerja}
            action={addContract}
          />
        </CardContent>
      </Card>

      {summary.mendekatiBatasPkwt && (
        <Alert>
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>
            Total masa PKWT sudah {formatLamaHari(summary.totalPkwtHari)}. Menurut PP 35/2021, PKWT paling lama 5 tahun
            termasuk perpanjangan. Pertimbangkan pengangkatan menjadi karyawan tetap (PKWTT).
          </AlertDescription>
        </Alert>
      )}

      {history.length === 0 ? (
        <EmptyState icon={FileSignature} message="Belum ada riwayat kontrak." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {history.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {CONTRACT_LABEL[c.jenis]}
                      {i === 0 && <Badge variant="neutral">Terbaru</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatTanggal(c.tanggal_mulai)} – {c.tanggal_selesai ? formatTanggal(c.tanggal_selesai) : "tanpa batas waktu"}
                      {c.tanggal_selesai && ` · ${formatLamaKontrak(c)}`}
                    </p>
                    {c.catatan && <p className="text-sm text-muted-foreground italic">“{c.catatan}”</p>}
                  </div>
                  <DeleteContractButton onConfirm={() => deleteContract(c.id)} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ContractDialog({
  mode,
  defaultJenis,
  defaultMulai,
  action,
}: {
  mode: "tambah" | "perpanjang";
  defaultJenis: Contract["jenis"];
  defaultMulai: string;
  action: (fd: FormData) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [jenis, setJenis] = useState(defaultJenis);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await action(fd);
      if (r.ok) {
        toast.success(mode === "perpanjang" ? "Kontrak diperpanjang." : "Kontrak ditambahkan.");
        setOpen(false);
      } else setError(r.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setJenis(defaultJenis);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={mode === "perpanjang" ? "default" : "outline"} size="sm" className="self-start">
          <FilePlus2 className="size-4" aria-hidden="true" /> {mode === "perpanjang" ? "Perpanjang kontrak" : "Tambah kontrak"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "perpanjang" ? "Perpanjang kontrak" : "Tambah kontrak"}</DialogTitle>
          <DialogDescription>
            Kontrak baru menjadi kontrak terbaru dan dipakai untuk pengingat ke HR.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <Field id="jenis" label="Jenis">
            <NativeSelect name="jenis" value={jenis} onChange={(e) => setJenis(e.target.value as Contract["jenis"])}>
              <option value="pkwt">{CONTRACT_LABEL.pkwt}</option>
              <option value="pkwtt">{CONTRACT_LABEL.pkwtt}</option>
              <option value="magang">{CONTRACT_LABEL.magang}</option>
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tanggalMulai" label="Tanggal mulai" required>
              <Input name="tanggalMulai" type="date" defaultValue={defaultMulai} required />
            </Field>
            {jenis !== "pkwtt" && (
              <Field id="tanggalSelesai" label="Tanggal selesai" required>
                <Input name="tanggalSelesai" type="date" required />
              </Field>
            )}
          </div>
          <Field id="catatan" label="Catatan" hint="Opsional, misalnya nomor SK atau kampus asal anak magang.">
            <Textarea name="catatan" maxLength={500} />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan kontrak"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteContractButton({ onConfirm }: { onConfirm: () => Promise<Result> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" aria-label="Hapus kontrak">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus kontrak ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Gunakan hanya untuk kontrak yang salah input. Penghapusan tercatat di audit log.
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
                const r = await onConfirm();
                if (r.ok) {
                  toast.success("Kontrak dihapus.");
                  setOpen(false);
                } else toast.error(r.error);
              });
            }}
          >
            {pending ? "Menghapus…" : "Hapus"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
