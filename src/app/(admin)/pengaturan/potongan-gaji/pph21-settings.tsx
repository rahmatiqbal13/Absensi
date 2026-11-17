"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatRupiah } from "@/lib/format/rupiah";
import { formatPersen, pph21 } from "@/lib/payroll/pph21";
import { cn } from "@/lib/utils";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Kategori = "A" | "B" | "C";
type Row = { batasBawah: string; tarifPersen: string };

const KATEGORI_HINT: Record<Kategori, string> = {
  A: "TK/0, TK/1, K/0",
  B: "TK/2, TK/3, K/1, K/2",
  C: "K/3",
};
const PTKP_ORDER = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export function Pph21Settings({
  metode,
  tarifTetap,
  brackets,
  ptkpMap,
  saveMetodePph21,
  saveTarifPph21,
  saveTerTable,
  savePtkpKategori,
}: {
  metode: "ter" | "tarif_tetap";
  tarifTetap: number;
  brackets: Record<Kategori, { batasBawah: number; tarifPersen: number }[]>;
  ptkpMap: Record<string, Kategori>;
  saveMetodePph21: (m: "ter" | "tarif_tetap") => Promise<Result>;
  saveTarifPph21: (tarif: number) => Promise<Result>;
  saveTerTable: (k: Kategori, rows: { batasBawah: number; tarifPersen: number }[]) => Promise<Result>;
  savePtkpKategori: (map: Record<string, Kategori>) => Promise<Result>;
}) {
  const [pending, start] = useTransition();
  const [tarif, setTarif] = useState(String(tarifTetap).replace(".", ","));
  const [tab, setTab] = useState<Kategori>("A");
  const [rows, setRows] = useState<Record<Kategori, Row[]>>(() => ({
    A: brackets.A.map((b) => ({ batasBawah: String(b.batasBawah), tarifPersen: String(b.tarifPersen) })),
    B: brackets.B.map((b) => ({ batasBawah: String(b.batasBawah), tarifPersen: String(b.tarifPersen) })),
    C: brackets.C.map((b) => ({ batasBawah: String(b.batasBawah), tarifPersen: String(b.tarifPersen) })),
  }));
  const [map, setMap] = useState<Record<string, Kategori>>(ptkpMap);

  function run(fn: () => Promise<Result>) {
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) toast.success(r.message ?? "Tersimpan.");
        else toast.error(r.error);
      } catch (e) {
        console.error(e);
        toast.error("Terjadi kesalahan. Coba lagi.");
      }
    });
  }

  const current = rows[tab];
  const sortedForRanges = current
    .map((r, i) => ({ i, lo: num(r.batasBawah) }))
    .filter((r) => Number.isFinite(r.lo))
    .sort((a, b) => a.lo - b.lo);
  const upperOf = (i: number) => {
    const idx = sortedForRanges.findIndex((r) => r.i === i);
    const next = sortedForRanges[idx + 1];
    return next ? next.lo - 1 : null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>PPh 21</CardTitle>
        <p className="text-sm text-muted-foreground">
          Dipotong dari penghasilan bruto bulanan (gaji pokok − potongan absensi + lembur). Berlaku untuk payroll yang
          dibuat setelah disimpan; slip lama tidak berubah.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div role="radiogroup" aria-label="Metode PPh 21" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["ter", "TER bulanan (PP 58/2023)", "Tarif efektif per kategori PTKP. Cara resmi pemotongan bulanan sejak 2024."],
              ["tarif_tetap", "Tarif tetap", "Satu persentase untuk semua karyawan. Tidak sesuai ketentuan PPh 21."],
            ] as const
          ).map(([v, label, desc]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={metode === v}
              disabled={pending}
              onClick={() => metode !== v && run(() => saveMetodePph21(v))}
              className={cn(
                "flex flex-col gap-1 rounded-xl p-4 text-left ring-1 transition-colors",
                metode === v ? "bg-accent ring-2 ring-primary" : "ring-input hover:bg-muted/60",
              )}
            >
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{desc}</span>
            </button>
          ))}
        </div>

        {metode === "tarif_tetap" ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveTarifPph21(num(tarif)));
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.8rem] font-semibold">Tarif (%)</span>
              <Input value={tarif} onChange={(e) => setTarif(e.target.value)} inputMode="decimal" className="h-11 w-28 font-mono" />
            </label>
            <Button type="submit" disabled={pending} className="h-11 px-5">Simpan tarif</Button>
            <p className="basis-full text-sm text-muted-foreground">
              Contoh: bruto Rp5.000.000 → PPh 21 {formatRupiah(pph21(5_000_000, num(tarif) || 0))}.
            </p>
          </form>
        ) : (
          <>
            <Alert variant="warning">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Cocokkan tabel ini dengan lampiran resmi PP 58/2023 sebelum dipakai untuk gaji sungguhan, dan uji paralel
                dengan perhitungan manual 1–2 periode. Penghitungan ulang tahunan (masa Desember) belum dihitung otomatis.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-3">
              <div role="tablist" aria-label="Kategori TER" className="flex gap-1 self-start rounded-xl bg-secondary p-1">
                {(["A", "B", "C"] as const).map((k) => (
                  <button
                    key={k}
                    role="tab"
                    type="button"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={cn(
                      "h-9 rounded-[9px] px-3.5 text-sm font-semibold",
                      tab === k ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}
                  >
                    Kategori {k}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">Kategori {tab}: {KATEGORI_HINT[tab]} (default).</p>

              <div className="overflow-x-auto rounded-xl ring-1 ring-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Bruto bulanan mulai dari (Rp)</th>
                      <th className="px-3 py-2 font-semibold">Sampai</th>
                      <th className="px-3 py-2 font-semibold">Tarif (%)</th>
                      <th className="px-3 py-2"><span className="sr-only">Hapus</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.map((r, i) => {
                      const hi = upperOf(i);
                      return (
                        <tr key={i} className="border-t border-hairline">
                          <td className="px-3 py-1.5">
                            <Input
                              aria-label={`Batas bawah baris ${i + 1}`}
                              inputMode="numeric"
                              value={r.batasBawah}
                              onChange={(e) =>
                                setRows((p) => ({ ...p, [tab]: p[tab].map((x, j) => (j === i ? { ...x, batasBawah: e.target.value } : x)) }))
                              }
                              className="h-9 w-40 font-mono"
                            />
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                            {hi == null ? "dan seterusnya" : formatRupiah(hi)}
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              aria-label={`Tarif baris ${i + 1}`}
                              inputMode="decimal"
                              value={r.tarifPersen}
                              onChange={(e) =>
                                setRows((p) => ({ ...p, [tab]: p[tab].map((x, j) => (j === i ? { ...x, tarifPersen: e.target.value } : x)) }))
                              }
                              className="h-9 w-24 font-mono"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Hapus baris ${i + 1}`}
                              onClick={() => setRows((p) => ({ ...p, [tab]: p[tab].filter((_, j) => j !== i) }))}
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRows((p) => ({ ...p, [tab]: [...p[tab], { batasBawah: "", tarifPersen: "" }] }))}
                >
                  <Plus /> Tambah baris
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      saveTerTable(
                        tab,
                        rows[tab].map((r) => ({ batasBawah: num(r.batasBawah), tarifPersen: num(r.tarifPersen) })),
                      ),
                    )
                  }
                >
                  Simpan kategori {tab}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Status PTKP → kategori TER</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PTKP_ORDER.map((st) => (
                  <label key={st} className="flex flex-col gap-1 text-sm">
                    <span className="font-mono font-semibold">{st}</span>
                    <NativeSelect
                      value={map[st] ?? "A"}
                      onChange={(e) => setMap((m) => ({ ...m, [st]: e.target.value as Kategori }))}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </NativeSelect>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={pending}
                onClick={() =>
                  run(() => savePtkpKategori(Object.fromEntries(PTKP_ORDER.map((st) => [st, map[st] ?? "A"]))))
                }
              >
                Simpan pemetaan
              </Button>
              <p className="text-xs text-muted-foreground">
                Contoh TER kategori A untuk bruto Rp7.000.000: {formatPersen(terPreview(brackets.A, 7_000_000))}.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function terPreview(rows: { batasBawah: number; tarifPersen: number }[], bruto: number): number {
  let rate = 0;
  for (const r of [...rows].sort((a, b) => a.batasBawah - b.batasBawah)) if (r.batasBawah <= bruto) rate = r.tarifPersen;
  return rate;
}
