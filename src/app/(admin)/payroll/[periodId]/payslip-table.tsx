"use client";

import { Fragment, useState } from "react";
import type { ActionResult } from "../actions";
import type { RincianHarianEntry } from "@/lib/payroll/deduction";
import { formatRupiah } from "@/lib/format/rupiah";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { ReceiptText } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type PayslipView = {
  id: string;
  nama: string;
  gajiPokok: number;
  hariKerjaEfektif: number;
  totalPotongan: number;
  gajiAkhir: number;
  rincian: RincianHarianEntry[];
};

export function PayslipTable({
  rows, status, onGenerate, onFinalize,
}: {
  rows: PayslipView[];
  status: "draft" | "final";
  onGenerate: () => Promise<ActionResult>;
  onFinalize: () => Promise<ActionResult>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>): Promise<boolean> {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setMessage(result.message ?? "Berhasil.");
      return true;
    } catch (err) {
      console.error("payslip-table action failed", err);
      setError("Terjadi kesalahan. Coba lagi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const totals = rows.reduce(
    (a, r) => ({
      gajiPokok: a.gajiPokok + r.gajiPokok,
      totalPotongan: a.totalPotongan + r.totalPotongan,
      gajiAkhir: a.gajiAkhir + r.gajiAkhir,
    }),
    { gajiPokok: 0, totalPotongan: 0, gajiAkhir: 0 },
  );

  return (
    <div className="space-y-4">
      {status === "draft" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={busy} onClick={() => run(onGenerate)}>
            {rows.length ? "Regenerate" : "Generate"}
          </Button>
          {rows.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="default" disabled={busy}>Finalisasi</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finalisasi periode ini?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Slip tidak bisa diubah lagi setelah periode difinalisasi.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy}
                    onClick={(e) => { e.preventDefault(); void run(onFinalize); }}
                  >
                    Finalisasi
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} message="Belum ada slip gaji. Klik Generate." />
      ) : (
        <>
          {/* desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right">Gaji Pokok</TableHead>
                  <TableHead className="text-right">Hari Efektif</TableHead>
                  <TableHead className="text-right">Potongan</TableHead>
                  <TableHead className="text-right">Gaji Akhir</TableHead>
                  <TableHead className="text-right">Rincian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow>
                      <TableCell className="font-medium text-foreground">{row.nama}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRupiah(row.gajiPokok)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.hariKerjaEfektif}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={row.totalPotongan > 0 ? "text-destructive" : undefined}>
                          {formatRupiah(row.totalPotongan)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatRupiah(row.gajiAkhir)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Rincian ${row.nama}`}
                          aria-expanded={expanded === row.id}
                          onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        >
                          {expanded === row.id ? "Tutup" : "Rincian"}
                        </Button>
                        <a href={`/slip-gaji/${row.id}/pdf`} className="ml-3 text-xs text-primary hover:underline">
                          PDF
                        </a>
                      </TableCell>
                    </TableRow>
                    {expanded === row.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40">
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {row.rincian.map((r) => (
                              <li key={r.tanggal} className="flex flex-wrap gap-x-4">
                                <span className="w-24">{r.tanggal}</span>
                                <span className="w-20">{r.jenis}</span>
                                <span className="w-28">{r.status ?? "-"}</span>
                                <span>terlambat {r.menit_terlambat}m · pulang cepat {r.menit_pulang_cepat}m</span>
                                <span className="text-destructive">{formatRupiah(r.potongan)}</span>
                                {r.catatan && <span className="italic">{r.catatan}</span>}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(totals.gajiPokok)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{formatRupiah(totals.totalPotongan)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(totals.gajiAkhir)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* mobile */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => (
              <Card key={row.id} size="sm">
                <CardContent className="space-y-1.5">
                  <div className="text-sm font-medium text-foreground">{row.nama}</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Gaji Pokok</dt>
                    <dd className="text-right tabular-nums">{formatRupiah(row.gajiPokok)}</dd>
                    <dt className="text-muted-foreground">Hari Efektif</dt>
                    <dd className="text-right tabular-nums">{row.hariKerjaEfektif}</dd>
                    <dt className="text-muted-foreground">Potongan</dt>
                    <dd className={`text-right tabular-nums ${row.totalPotongan > 0 ? "text-destructive" : ""}`}>{formatRupiah(row.totalPotongan)}</dd>
                    <dt className="text-muted-foreground">Gaji Akhir</dt>
                    <dd className="text-right font-medium tabular-nums">{formatRupiah(row.gajiAkhir)}</dd>
                  </dl>
                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button" variant="ghost" size="sm"
                      aria-label={`Rincian ${row.nama}`}
                      aria-expanded={expanded === row.id}
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    >
                      {expanded === row.id ? "Tutup" : "Rincian"}
                    </Button>
                    <a href={`/slip-gaji/${row.id}/pdf`} className="self-center text-xs text-primary hover:underline">PDF</a>
                  </div>
                  {expanded === row.id && (
                    <ul className="space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                      {row.rincian.map((r) => (
                        <li key={r.tanggal} className="flex flex-wrap gap-x-3">
                          <span>{r.tanggal}</span><span>{r.status ?? "-"}</span>
                          <span className="text-destructive">{formatRupiah(r.potongan)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
            <Card size="sm">
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="font-medium">Total Gaji Pokok</dt>
                  <dd className="text-right tabular-nums">{formatRupiah(totals.gajiPokok)}</dd>
                  <dt className="font-medium">Total Potongan</dt>
                  <dd className="text-right tabular-nums">{formatRupiah(totals.totalPotongan)}</dd>
                  <dt className="font-medium">Total Gaji Akhir</dt>
                  <dd className="text-right tabular-nums">{formatRupiah(totals.gajiAkhir)}</dd>
                </dl>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
