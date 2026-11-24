"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { FilterBar } from "@/components/filter-bar";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Defaults = { cabang: string; dept: string; dari: string; sampai: string };

export function LaporanFilters({
  branches,
  departments,
  defaults,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string; branchId: string }[];
  defaults: Defaults;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  // Always build the URL from what the form shows now, not from the props of
  // the last render: those lag behind while a navigation is in flight, which
  // paired a new "sampai" with a stale "dari" (and Terapkan resent the stale pair).
  function pushWith(over: Partial<Defaults>) {
    const fd = formRef.current ? new FormData(formRef.current) : null;
    const current = (k: keyof Defaults) => {
      const v = fd?.get(k);
      return typeof v === "string" ? v : defaults[k];
    };
    const next = { cabang: current("cabang"), dept: current("dept"), dari: current("dari"), sampai: current("sampai"), ...over };
    const params = new URLSearchParams();
    params.set("cabang", next.cabang);
    if (next.dept) params.set("dept", next.dept);
    params.set("dari", next.dari);
    params.set("sampai", next.sampai);
    router.push(`/laporan?${params.toString()}`);
  }

  const deptOptions = departments.filter((d) => d.branchId === defaults.cabang);

  return (
    <FilterBar>
      <form
        ref={formRef}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          pushWith({});
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cabang">Cabang</Label>
          <NativeSelect
            id="cabang"
            name="cabang"
            defaultValue={defaults.cabang}
            onChange={(e) => pushWith({ cabang: e.target.value, dept: "" })}
            className="h-9 w-44"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.nama}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dept">Departemen</Label>
          <NativeSelect
            id="dept"
            name="dept"
            defaultValue={defaults.dept}
            onChange={(e) => pushWith({ dept: e.target.value })}
            className="h-9 w-44"
          >
            <option value="">Semua departemen</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.nama}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dari">Dari</Label>
          <Input id="dari" name="dari" type="date" key={defaults.dari} defaultValue={defaults.dari} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sampai">Sampai</Label>
          <Input id="sampai" name="sampai" type="date" key={defaults.sampai} defaultValue={defaults.sampai} className="h-9 w-40" />
        </div>
        <Button type="submit" size="sm">Terapkan</Button>
      </form>
    </FilterBar>
  );
}
