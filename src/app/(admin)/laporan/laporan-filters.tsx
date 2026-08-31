"use client";

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

  function pushWith(over: Partial<Defaults>) {
    const next = { ...defaults, ...over };
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
          <Input id="dari" type="date" defaultValue={defaults.dari}
            onChange={(e) => pushWith({ dari: e.target.value })} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sampai">Sampai</Label>
          <Input id="sampai" type="date" defaultValue={defaults.sampai}
            onChange={(e) => pushWith({ sampai: e.target.value })} className="h-9 w-40" />
        </div>
        <Button type="submit" size="sm">Terapkan</Button>
      </form>
    </FilterBar>
  );
}
