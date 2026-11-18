"use client";

import { useRef, useState, useTransition } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Result = { ok: true; message?: string } | { ok: false; error: string };
export type ShiftRow = { id: string; nama: string; jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number };

export function ShiftList({
  shifts,
  create,
  remove,
}: {
  shifts: ShiftRow[];
  create: (fd: FormData) => Promise<Result>;
  remove: (id: string) => Promise<Result>;
}) {
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Daftar shift</h2>
      {shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada shift di cabang ini.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shifts.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                <b>{s.nama}</b> · {s.jam_masuk.slice(0, 5)}–{s.jam_pulang.slice(0, 5)} · toleransi {s.toleransi_terlambat_menit} mnt
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Hapus shift ${s.nama}`}
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Hapus shift ${s.nama}? Hari-hari roster dengan shift ini kembali ke jadwal biasa.`)) return;
                  startTransition(async () => {
                    const r = await remove(s.id);
                    if (!r.ok) toast.error(r.error);
                  });
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        ref={form}
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end"
        action={(fd) =>
          startTransition(async () => {
            const r = await create(fd);
            if (r.ok) {
              toast.success("Shift ditambahkan.");
              form.current?.reset();
            } else toast.error(r.error);
          })
        }
      >
        <Field id="nama" label="Nama shift" required>
          <Input name="nama" maxLength={40} placeholder="Pagi" required />
        </Field>
        <Field id="jam_masuk" label="Masuk" required>
          <Input name="jam_masuk" type="time" required />
        </Field>
        <Field id="jam_pulang" label="Pulang" required>
          <Input name="jam_pulang" type="time" required />
        </Field>
        <Field id="toleransi" label="Toleransi (mnt)">
          <Input name="toleransi" type="number" min={0} max={180} defaultValue={10} className="w-24" />
        </Field>
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" aria-hidden="true" /> Tambah
        </Button>
      </form>
    </section>
  );
}

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function RosterGrid({
  days,
  employees,
  shifts,
  assignments,
  setDay,
  copyPrevious,
}: {
  days: string[];
  employees: { id: string; nama: string }[];
  shifts: ShiftRow[];
  /** "employeeId|date" → shift id or "libur". */
  assignments: Record<string, string>;
  setDay: (employeeId: string, tanggal: string, value: string) => Promise<Result>;
  copyPrevious: () => Promise<Result>;
}) {
  const [local, setLocal] = useState(assignments);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Roster minggu ini</h2>
          <p className="text-sm text-muted-foreground">
            &ldquo;Jadwal biasa&rdquo; memakai jadwal kerja cabang/departemen. Perubahan tersimpan langsung.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await copyPrevious();
              if (r.ok) toast.success(r.message ?? "Roster disalin.");
              else toast.error(r.error);
            })
          }
        >
          <Copy className="size-4" aria-hidden="true" /> Salin minggu lalu
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Roster shift per karyawan dan tanggal</caption>
          <thead>
            <tr className="text-left">
              <th className="py-2 pr-2 font-semibold">Karyawan</th>
              {days.map((d) => {
                const dt = new Date(`${d}T00:00:00Z`);
                return (
                  <th key={d} className="px-1 py-2 font-semibold">
                    {HARI[dt.getUTCDay()]} {dt.getUTCDate()}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                  {e.nama}
                </th>
                {days.map((d) => {
                  const key = `${e.id}|${d}`;
                  return (
                    <td key={d} className="px-1 py-1.5">
                      <NativeSelect
                        aria-label={`${e.nama}, ${d}`}
                        value={local[key] ?? ""}
                        className="h-9 min-w-24 text-xs"
                        onChange={(ev) => {
                          const value = ev.target.value;
                          const prev = local[key] ?? "";
                          setLocal((m) => ({ ...m, [key]: value }));
                          startTransition(async () => {
                            const r = await setDay(e.id, d, value);
                            if (!r.ok) {
                              toast.error(r.error);
                              setLocal((m) => ({ ...m, [key]: prev }));
                            }
                          });
                        }}
                      >
                        <option value="">Jadwal biasa</option>
                        {shifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nama} {s.jam_masuk.slice(0, 5)}
                          </option>
                        ))}
                        <option value="libur">Libur</option>
                      </NativeSelect>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
