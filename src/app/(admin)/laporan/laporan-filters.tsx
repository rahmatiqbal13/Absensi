"use client";

import { useRouter } from "next/navigation";

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
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        pushWith({});
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="cabang" className="text-sm text-neutral-700">
          Cabang
        </label>
        <select
          id="cabang"
          defaultValue={defaults.cabang}
          onChange={(e) => pushWith({ cabang: e.target.value, dept: "" })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nama}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dept" className="text-sm text-neutral-700">
          Departemen
        </label>
        <select
          id="dept"
          defaultValue={defaults.dept}
          onChange={(e) => pushWith({ dept: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Semua departemen</option>
          {deptOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nama}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dari" className="text-sm text-neutral-700">
          Dari
        </label>
        <input
          id="dari"
          type="date"
          defaultValue={defaults.dari}
          onChange={(e) => pushWith({ dari: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="sampai" className="text-sm text-neutral-700">
          Sampai
        </label>
        <input
          id="sampai"
          type="date"
          defaultValue={defaults.sampai}
          onChange={(e) => pushWith({ sampai: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      >
        Terapkan
      </button>
    </form>
  );
}
