"use client";

import { useRouter } from "next/navigation";

const AKSI_OPTIONS = [
  { value: "", label: "Semua aksi" },
  { value: "employee_created", label: "Karyawan Dibuat" },
  { value: "employee_updated", label: "Karyawan Diubah" },
  { value: "employee_deactivated", label: "Karyawan Dinonaktifkan" },
  { value: "employee_reactivated", label: "Karyawan Diaktifkan" },
  { value: "employee_deleted", label: "Karyawan Dihapus" },
  { value: "leave_approved", label: "Cuti Disetujui" },
  { value: "leave_rejected", label: "Cuti Ditolak" },
];

export function AuditFilters({
  employees,
  defaults,
}: {
  employees: { id: string; nama: string }[];
  defaults: { dari?: string; sampai?: string; target?: string; aksi?: string };
}) {
  const router = useRouter();

  function pushWith(overrides: Record<string, string>) {
    const next = {
      dari: defaults.dari ?? "",
      sampai: defaults.sampai ?? "",
      target: defaults.target ?? "",
      aksi: defaults.aksi ?? "",
      ...overrides,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    router.push(`/pengaturan/audit?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Dari
        <input
          type="date"
          defaultValue={defaults.dari}
          onChange={(e) => pushWith({ dari: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Sampai
        <input
          type="date"
          defaultValue={defaults.sampai}
          onChange={(e) => pushWith({ sampai: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Karyawan
        <select
          defaultValue={defaults.target ?? ""}
          onChange={(e) => pushWith({ target: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Semua</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nama}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Aksi
        <select
          defaultValue={defaults.aksi ?? ""}
          onChange={(e) => pushWith({ aksi: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {AKSI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
