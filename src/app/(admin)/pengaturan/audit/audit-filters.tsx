"use client";

import { useRouter } from "next/navigation";
import { FilterBar } from "@/components/filter-bar";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const AKSI_OPTIONS = [
  { value: "", label: "Semua aksi" },
  { value: "employee_created", label: "Karyawan Dibuat" },
  { value: "employee_updated", label: "Karyawan Diubah" },
  { value: "employee_deactivated", label: "Karyawan Dinonaktifkan" },
  { value: "employee_reactivated", label: "Karyawan Diaktifkan" },
  { value: "employee_deleted", label: "Karyawan Dihapus" },
  { value: "leave_approved", label: "Cuti Disetujui" },
  { value: "leave_rejected", label: "Cuti Ditolak" },
  { value: "branch_location_update", label: "Lokasi Kantor Diubah" },
  { value: "branch_created", label: "Cabang Dibuat" },
  { value: "branch_updated", label: "Cabang Diubah" },
  { value: "branch_deleted", label: "Cabang Dihapus" },
  { value: "branch_qr_update", label: "Absen QR Diubah" },
  { value: "branch_kiosk_reset", label: "Link & Kode Kiosk Diganti" },
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
    <FilterBar>
      <Field id="audit-dari" label="Dari">
        <Input
          type="date"
          defaultValue={defaults.dari}
          onChange={(e) => pushWith({ dari: e.target.value })}
          className="w-40"
        />
      </Field>
      <Field id="audit-sampai" label="Sampai">
        <Input
          type="date"
          defaultValue={defaults.sampai}
          onChange={(e) => pushWith({ sampai: e.target.value })}
          className="w-40"
        />
      </Field>
      <Field id="audit-target" label="Karyawan">
        <NativeSelect
          defaultValue={defaults.target ?? ""}
          onChange={(e) => pushWith({ target: e.target.value })}
          className="w-48"
        >
          <option value="">Semua</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.nama}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="audit-aksi" label="Aksi">
        <NativeSelect
          defaultValue={defaults.aksi ?? ""}
          onChange={(e) => pushWith({ aksi: e.target.value })}
          className="w-48"
        >
          {AKSI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </NativeSelect>
      </Field>
    </FilterBar>
  );
}
