"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ScheduleForm, DAYS_MON_FIRST, type ScheduleDefaults } from "./schedule-form";

type Result = { ok: true } | { ok: false; error: string };
type Schedule = NonNullable<ScheduleDefaults>;

export type DepartmentSchedule = {
  id: string;
  nama: string;
  /** null = follows the branch schedule */
  schedule: Schedule | null;
};

export function summarizeSchedule(s: Schedule): string {
  const days = DAYS_MON_FIRST.filter((d) => s.hariKerja.includes(d.v)).map((d) => d.label).join(", ");
  return `${s.jamMasuk}–${s.jamPulang} · ${days}`;
}

export function BranchScheduleCard({
  branchId,
  branchNama,
  branchSchedule,
  departments,
  saveSchedule,
  removeDepartmentSchedule,
}: {
  branchId: string;
  branchNama: string;
  branchSchedule: Schedule | null;
  departments: DepartmentSchedule[];
  saveSchedule: (branchId: string, departmentId: string | null, fd: FormData) => Promise<Result>;
  removeDepartmentSchedule: (departmentId: string) => Promise<Result>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{branchNama}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Jadwal cabang — berlaku untuk semua karyawan, kecuali departemen yang punya jadwal sendiri.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ScheduleForm
          branchId={branchId}
          label={branchNama}
          defaults={branchSchedule}
          saveSchedule={saveSchedule}
        />

        <Separator />

        <section aria-labelledby={`dept-heading-${branchId}`} className="flex flex-col gap-3">
          <div>
            <h3 id={`dept-heading-${branchId}`} className="text-[0.95rem] font-semibold text-foreground">
              Jadwal per departemen
            </h3>
            <p className="text-sm text-muted-foreground">
              Atur jam kerja khusus bila sebuah departemen bekerja di jam atau hari yang berbeda.
            </p>
          </div>

          {departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada departemen di cabang ini.{" "}
              <Link href="/pengaturan/departemen" className="font-semibold text-brand-text underline-offset-4 hover:underline">
                Tambah departemen
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {departments.map((d) => {
                const expanded = open.has(d.id);
                return (
                  <li key={d.id} className="rounded-xl bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-semibold text-foreground">{d.nama}</span>
                        {d.schedule ? (
                          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="info">Jadwal khusus</Badge>
                            <span className="font-mono">{summarizeSchedule(d.schedule)}</span>
                          </span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="neutral">Ikut jadwal cabang</Badge>
                            {branchSchedule && <span className="font-mono">{summarizeSchedule(branchSchedule)}</span>}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-expanded={expanded}
                        aria-controls={`dept-form-${d.id}`}
                        onClick={() => toggle(d.id)}
                      >
                        {expanded ? <ChevronUp /> : d.schedule ? <ChevronDown /> : <Clock />}
                        {expanded ? "Tutup" : d.schedule ? "Ubah jadwal" : "Atur jadwal khusus"}
                      </Button>
                    </div>
                    {expanded && (
                      <div id={`dept-form-${d.id}`} className="mt-4">
                        <ScheduleForm
                          branchId={branchId}
                          departmentId={d.id}
                          label={d.nama}
                          // A new department schedule starts from the branch's.
                          defaults={d.schedule ?? branchSchedule}
                          saveSchedule={saveSchedule}
                          extraActions={
                            d.schedule ? (
                              <ConfirmDeleteButton
                                action={() => removeDepartmentSchedule(d.id)}
                                title={`Hapus jadwal khusus ${d.nama}?`}
                                description="Karyawan di departemen ini akan kembali mengikuti jadwal cabang."
                                label="Ikuti jadwal cabang"
                                confirmLabel="Hapus jadwal khusus"
                              />
                            ) : null
                          }
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
