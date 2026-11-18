"use client";

import { useId, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format/rupiah";

export type GenerateCandidate = {
  id: string;
  nama: string;
  jabatan: string | null;
  gajiPokok: number;
};

/**
 * Pick who gets a payslip this period, then generate. Pre-selects the people
 * already in the period (on regenerate) or everyone with a salary set (first
 * time) — an account with gaji pokok 0 is usually an admin, not payroll.
 */
export function GenerateDialog({
  candidates,
  currentIds,
  regenerate,
  disabled,
  onGenerate,
}: {
  candidates: GenerateCandidate[];
  currentIds: string[];
  regenerate: boolean;
  disabled: boolean;
  onGenerate: (employeeIds: string[]) => void;
}) {
  const uid = useId();
  const initial = useMemo(
    () =>
      new Set(
        regenerate
          ? currentIds.filter((id) => candidates.some((c) => c.id === id))
          : candidates.filter((c) => c.gajiPokok > 0).map((c) => c.id),
      ),
    [candidates, currentIds, regenerate],
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(initial);

  const allChecked = candidates.length > 0 && selected.size === candidates.length;
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(new Set(initial)); // fresh selection each time it opens
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          {regenerate ? "Regenerate" : "Generate"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pilih karyawan</DialogTitle>
          <DialogDescription>
            Slip gaji dibuat hanya untuk karyawan yang dicentang.
            {regenerate && " Slip yang sudah ada untuk periode ini akan diganti dengan pilihan ini."}
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada karyawan aktif di cabang ini.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex min-h-11 items-center gap-3 border-b border-border pb-2 text-sm font-semibold">
              <Checkbox
                checked={allChecked ? true : selected.size > 0 ? "indeterminate" : false}
                onCheckedChange={(v) => setSelected(v === true ? new Set(candidates.map((c) => c.id)) : new Set())}
                aria-label="Pilih semua karyawan"
              />
              Pilih semua ({selected.size}/{candidates.length})
            </label>
            <ul className="max-h-80 overflow-y-auto">
              {candidates.map((c) => {
                const id = `${uid}-${c.id}`;
                return (
                  <li key={c.id}>
                    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 hover:bg-muted">
                      <Checkbox id={id} checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{c.nama}</span>
                        {c.jabatan && <span className="truncate text-xs text-muted-foreground">{c.jabatan}</span>}
                      </span>
                      <span
                        className={
                          c.gajiPokok > 0
                            ? "font-mono text-xs tabular-nums text-muted-foreground"
                            : "text-xs text-warning-foreground"
                        }
                      >
                        {c.gajiPokok > 0 ? formatRupiah(c.gajiPokok) : "Gaji pokok belum diisi"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            disabled={selected.size === 0}
            onClick={() => {
              setOpen(false);
              onGenerate(candidates.filter((c) => selected.has(c.id)).map((c) => c.id));
            }}
          >
            <Users className="size-4" aria-hidden="true" /> Generate {selected.size} slip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
