"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PinEmployee } from "./mesin-import";
import type { SetPinResult } from "./actions";

type SetPin = (employeeId: string, pin: string) => Promise<SetPinResult>;

/** Every active employee with their machine PIN, editable in place. */
export function PinTable({ employees, setPin }: { employees: PinEmployee[]; setPin: SetPin }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">PIN mesin absensi per pegawai</caption>
        <thead className="bg-muted text-left">
          <tr>
            <th className="px-3 py-2 font-semibold">Pegawai</th>
            <th className="px-3 py-2 font-semibold">PIN di mesin</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <PinRow key={`${e.id}:${e.pin ?? ""}`} employee={e} setPin={setPin} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PinRow({ employee, setPin }: { employee: PinEmployee; setPin: SetPin }) {
  const [value, setValue] = useState(employee.pin ?? "");
  const [saved, setSaved] = useState(employee.pin ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== saved;

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">{employee.nama}</td>
      <td className="px-3 py-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            startTransition(async () => {
              const r = await setPin(employee.id, value);
              if (!r.ok) return void toast.error(r.error);
              setSaved(value.trim());
              toast.success(
                value.trim()
                  ? `PIN ${employee.nama} disimpan${r.diproses ? `, ${r.diproses} hari absensi dari scan tersimpan dimasukkan` : ""}.`
                  : `PIN ${employee.nama} dihapus.`,
              );
            });
          }}
        >
          <Input
            aria-label={`PIN mesin ${employee.nama}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            maxLength={20}
            placeholder="—"
            className="h-9 w-28 font-mono"
          />
          {dirty && (
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              <Save className="size-4" aria-hidden="true" /> {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          )}
        </form>
      </td>
    </tr>
  );
}
