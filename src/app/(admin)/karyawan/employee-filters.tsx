"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Defaults = { cabang?: string; role?: string; status: string; q: string };

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Semua role" },
  { value: "karyawan", label: "Karyawan" },
  { value: "atasan", label: "Atasan" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export function EmployeeFilters({
  branches,
  defaults,
}: {
  branches: { id: string; nama: string }[];
  defaults: Defaults;
}) {
  const router = useRouter();
  const [q, setQ] = useState(defaults.q);

  function pushWith(overrides: Partial<Defaults>) {
    const next = {
      cabang: defaults.cabang ?? "",
      role: defaults.role ?? "",
      status: defaults.status,
      q,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (next.cabang) params.set("cabang", next.cabang);
    if (next.role) params.set("role", next.role);
    params.set("status", next.status || "semua");
    if (next.q) params.set("q", next.q);
    router.push(`/karyawan?${params.toString()}`);
  }

  return (
    <FilterBar>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          pushWith({ q });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Cari nama</Label>
          <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cabang">Cabang</Label>
          <NativeSelect
            id="cabang"
            defaultValue={defaults.cabang ?? ""}
            onChange={(e) => pushWith({ cabang: e.target.value })}
            className="h-9 w-44"
          >
            <option value="">Semua cabang</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.nama}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role</Label>
          <NativeSelect
            id="role"
            defaultValue={defaults.role ?? ""}
            onChange={(e) => pushWith({ role: e.target.value })}
            className="h-9 w-40"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <NativeSelect
            id="status"
            defaultValue={defaults.status}
            onChange={(e) => pushWith({ status: e.target.value })}
            className="h-9 w-32"
          >
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="semua">Semua</option>
          </NativeSelect>
        </div>
        <Button type="submit" size="sm">
          <Search className="size-4" /> Cari
        </Button>
      </form>
    </FilterBar>
  );
}
