"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { shouldDeductAlpa } from "@/lib/payroll/absence-deduction";
import { pph21 } from "@/lib/payroll/pph21";
import { formatRupiah } from "@/lib/format/rupiah";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export type AlpaEmployee = {
  id: string;
  nama: string;
  jabatan: string;
  branchId: string;
  branchNama: string;
  /** null = follow the company setting */
  potongAlpa: boolean | null;
};

type Choice = "ikut" | "potong" | "tidak";
const CHOICE_VALUE: Record<Choice, boolean | null> = { ikut: null, potong: true, tidak: false };

export function PotonganGajiManager({
  companyDefault,
  tarifPph21,
  employees,
  branches,
  saveCompanyPotongAlpa,
  setEmployeesPotongAlpa,
  saveTarifPph21,
}: {
  companyDefault: boolean;
  tarifPph21: number;
  saveTarifPph21: (tarifPersen: number) => Promise<Result>;
  employees: AlpaEmployee[];
  branches: { id: string; nama: string }[];
  saveCompanyPotongAlpa: (enabled: boolean) => Promise<Result>;
  setEmployeesPotongAlpa: (ids: string[], value: boolean | null) => Promise<Result>;
}) {
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<Choice>("potong");
  const [tarif, setTarif] = useState(String(tarifPph21));

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter(
      (e) => (!branch || e.branchId === branch) && (!needle || e.nama.toLowerCase().includes(needle)),
    );
  }, [employees, q, branch]);

  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));
  const deductedCount = employees.filter((e) => shouldDeductAlpa(companyDefault, e.potongAlpa)).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of visible) {
        if (allVisibleSelected) next.delete(e.id);
        else next.add(e.id);
      }
      return next;
    });
  }

  function run(fn: () => Promise<Result>, onOk?: () => void) {
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success(r.message ?? "Pengaturan tersimpan.");
        onOk?.();
      } catch (e) {
        console.error(e);
        toast.error("Terjadi kesalahan. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>PPh 21</CardTitle>
          <p className="text-sm text-muted-foreground">
            Dipotong dari setiap slip gaji: tarif × (gaji pokok − potongan absensi). Berlaku untuk payroll yang dibuat
            setelah disimpan; slip lama tetap memakai tarif saat dibuat.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveTarifPph21(Number(tarif.replace(",", "."))));
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.8rem] font-semibold text-foreground">Tarif (%)</span>
              <Input
                name="tarifPph21"
                inputMode="decimal"
                value={tarif}
                onChange={(e) => setTarif(e.target.value)}
                className="h-11 w-28 font-mono"
                aria-describedby="tarif-pph21-hint"
              />
            </label>
            <Button type="submit" disabled={pending} className="h-11 px-5">
              Simpan tarif
            </Button>
            <p id="tarif-pph21-hint" className="basis-full text-sm text-muted-foreground">
              Contoh: gaji pokok Rp5.000.000 tanpa potongan absensi → PPh 21{" "}
              {formatRupiah(pph21(5_000_000, Number(tarif.replace(",", ".")) || 0))}.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Potongan alpa — pengaturan perusahaan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex cursor-pointer items-start gap-3.5 rounded-xl bg-background p-4">
            <span className="relative mt-0.5 inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                checked={companyDefault}
                disabled={pending}
                onChange={(e) => run(() => saveCompanyPotongAlpa(e.target.checked))}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="h-7 w-[46px] rounded-full bg-input/60 transition-colors peer-checked:bg-brand peer-focus-visible:ring-3 peer-focus-visible:ring-brand/40 peer-disabled:opacity-60"
              />
              <span
                aria-hidden="true"
                className="absolute top-[3px] left-[3px] size-[22px] rounded-full bg-field shadow-sm transition-transform peer-checked:translate-x-[18px]"
              />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[0.9rem] font-semibold text-foreground">
                Potong gaji untuk hari alpa (semua karyawan)
              </span>
              <span className="max-w-[640px] text-sm leading-relaxed text-muted-foreground">
                Bila mati, karyawan tetap menerima gaji penuh walau alpa — hari alpa tetap tercatat di slip gaji.
                Bila aktif, setiap hari alpa memotong satu hari upah. Pilihan per karyawan di bawah selalu didahulukan.
              </span>
            </span>
          </label>
          <p className="text-sm text-muted-foreground">
            Saat ini <b className="text-foreground">{deductedCount}</b> dari {employees.length} karyawan aktif dipotong
            bila alpa. Berlaku saat payroll dibuat ulang; slip yang sudah difinalisasi tidak berubah.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Potongan alpa — per karyawan</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pilih karyawan, lalu terapkan pilihan. &quot;Ikut perusahaan&quot; mengembalikan karyawan ke pengaturan di atas.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nama karyawan"
                aria-label="Cari nama karyawan"
                className="pl-9"
              />
            </div>
            <div className="w-full sm:w-56">
              <NativeSelect value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter cabang">
                <option value="">Semua cabang</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.nama}</option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 p-3">
            <span className="mr-auto text-sm font-semibold">{selected.size} dipilih</span>
            <div className="w-full sm:w-52">
              <NativeSelect
                value={choice}
                onChange={(e) => setChoice(e.target.value as Choice)}
                aria-label="Pilihan potongan alpa"
              >
                <option value="potong">Dipotong bila alpa</option>
                <option value="tidak">Tidak dipotong</option>
                <option value="ikut">Ikut perusahaan</option>
              </NativeSelect>
            </div>
            <Button
              type="button"
              disabled={pending || selected.size === 0}
              onClick={() =>
                run(() => setEmployeesPotongAlpa([...selected], CHOICE_VALUE[choice]), () => setSelected(new Set()))
              }
            >
              Terapkan
            </Button>
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada karyawan yang cocok.</p>
          ) : (
            <ul className="divide-y divide-border">
              <li className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Pilih semua yang tampil"
                  className="size-4 accent-brand"
                />
                <span className="text-sm font-semibold text-muted-foreground">Pilih semua yang tampil ({visible.length})</span>
              </li>
              {visible.map((e) => {
                const deducted = shouldDeductAlpa(companyDefault, e.potongAlpa);
                return (
                  <li key={e.id}>
                    <label className="flex cursor-pointer flex-wrap items-center gap-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => toggle(e.id)}
                        className="size-4 accent-brand"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-foreground">{e.nama}</span>
                        <span className="text-sm text-muted-foreground">
                          {e.jabatan} · {e.branchNama}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {e.potongAlpa === null && <Badge variant="neutral">Ikut perusahaan</Badge>}
                        <Badge variant={deducted ? "danger" : "success"}>
                          {deducted ? "Dipotong bila alpa" : "Gaji penuh"}
                        </Badge>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
