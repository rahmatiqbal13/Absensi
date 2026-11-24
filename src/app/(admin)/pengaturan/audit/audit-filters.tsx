"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { AUDIT_KATEGORI } from "@/lib/audit/kategori";
import { cn } from "@/lib/utils";
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
  { value: "attendance_correction_approved", label: "Koreksi Absensi Disetujui" },
  { value: "attendance_correction_rejected", label: "Koreksi Absensi Ditolak" },
  { value: "payroll_paid", label: "Payroll Dibayar" },
  { value: "payroll_paid_undone", label: "Status Dibayar Dibatalkan" },
  { value: "password_reset_link", label: "Link Reset Sandi Dibuat" },
  { value: "leave_approved", label: "Cuti Disetujui" },
  { value: "leave_rejected", label: "Cuti Ditolak" },
  { value: "leave_cancelled", label: "Cuti Dibatalkan" },
  { value: "branch_location_update", label: "Lokasi Kantor Diubah" },
  { value: "mesin_absensi_import", label: "Impor Mesin Absensi" },
  { value: "employee_pin_mesin_set", label: "PIN Mesin Diatur" },
  { value: "branch_created", label: "Cabang Dibuat" },
  { value: "branch_updated", label: "Cabang Diubah" },
  { value: "branch_deleted", label: "Cabang Dihapus" },
  { value: "branch_qr_update", label: "Absen QR Diubah" },
  { value: "branch_kiosk_reset", label: "Link & Kode Kiosk Diganti" },
  { value: "contract_added", label: "Kontrak Ditambahkan" },
  { value: "contract_deleted", label: "Kontrak Dihapus" },
  { value: "work_request_approved", label: "Pengajuan Disetujui" },
  { value: "work_request_rejected", label: "Pengajuan Ditolak" },
  { value: "birth_date_corrected", label: "Tanggal Lahir Dikoreksi" },
  { value: "consent_withdrawn", label: "Persetujuan Data Ditarik" },
  { value: "attendance_evidence_viewed", label: "Foto & Lokasi Absen Dibuka" },
];

export function AuditFilters({
  employees,
  defaults,
}: {
  employees: { id: string; nama: string }[];
  defaults: { dari?: string; sampai?: string; target?: string; aksi?: string; q?: string; jenis?: string };
}) {
  const router = useRouter();
  // Filters changed since the last render: `defaults` lags behind while a
  // navigation is in flight, so a second quick change must not resend a stale value.
  const pending = useRef<Record<string, string>>({});

  function hrefWith(overrides: Record<string, string>, unrendered: Record<string, string> = {}) {
    const next = {
      q: defaults.q ?? "",
      jenis: defaults.jenis ?? "",
      dari: defaults.dari ?? "",
      sampai: defaults.sampai ?? "",
      target: defaults.target ?? "",
      aksi: defaults.aksi ?? "",
      ...unrendered,
      ...overrides,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/pengaturan/audit?${qs}` : "/pengaturan/audit";
  }

  function pushWith(overrides: Record<string, string>) {
    const href = hrefWith(overrides, pending.current);
    pending.current = { ...pending.current, ...overrides };
    router.push(href);
  }

  const tabs = [{ value: "", label: "Semua" }, ...AUDIT_KATEGORI];

  return (
    <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-end gap-3">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get("q");
          pushWith({ q: typeof v === "string" ? v.trim() : "" });
        }}
        className="flex min-w-[240px] flex-1 flex-col gap-1.5"
      >
        <label htmlFor="audit-q" className="text-sm font-medium">Pelaku atau target</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="audit-q" name="q" defaultValue={defaults.q} placeholder="Cari nama, lalu Enter" className="pl-9" />
        </div>
      </form>
      <nav aria-label="Jenis aksi" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
        {tabs.map((t) => {
          const on = (defaults.jenis ?? "") === t.value;
          return (
            <Link
              key={t.value || "semua"}
              href={hrefWith({ jenis: t.value, aksi: "" })}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex h-8.5 items-center rounded-[9px] px-3 text-[0.8rem] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-card",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
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
          key={defaults.aksi ?? ""}
          defaultValue={defaults.aksi ?? ""}
          onChange={(e) => pushWith({ aksi: e.target.value, jenis: "" })}
          className="w-48"
        >
          {AKSI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </NativeSelect>
      </Field>
    </FilterBar>
    </div>
  );
}
