"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

  function pushWith(overrides: Partial<Defaults & { q: string }>) {
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
    if (next.status) params.set("status", next.status);
    if (next.q) params.set("q", next.q);
    router.push(`/karyawan?${params.toString()}`);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        pushWith({ q });
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="q" className="text-sm text-neutral-700">
          Cari nama
        </label>
        <input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="cabang" className="text-sm text-neutral-700">
          Cabang
        </label>
        <select
          id="cabang"
          defaultValue={defaults.cabang ?? ""}
          onChange={(e) => pushWith({ cabang: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nama}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="role" className="text-sm text-neutral-700">
          Role
        </label>
        <select
          id="role"
          defaultValue={defaults.role ?? ""}
          onChange={(e) => pushWith({ role: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm text-neutral-700">
          Status
        </label>
        <select
          id="status"
          defaultValue={defaults.status}
          onChange={(e) => pushWith({ status: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
          <option value="">Semua</option>
        </select>
      </div>
      <button
        type="submit"
        className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      >
        Cari
      </button>
    </form>
  );
}
