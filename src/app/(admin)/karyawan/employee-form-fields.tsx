"use client";

import { useState } from "react";
import { Field } from "@/components/field";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type EmployeeFieldValues = {
  nama: string; email: string | null; jabatan: string; statusKontrak: string; statusPtkp?: string;
  tanggalMulaiKerja: string; gajiPokok: string; role: string;
  branchId: string; departmentId: string; atasanId: string; designatedApproverId: string;
};

// Values match STATUS_KONTRAK_FOR in lib/employees/contracts.ts (synced from the latest contract).
const STATUS_KONTRAK_OPTIONS = [
  { value: "tetap", label: "Tetap (PKWTT)" },
  { value: "PKWT", label: "Kontrak (PKWT)" },
  { value: "Magang", label: "Magang" },
];

// TK = tidak kawin, K = kawin; the digit is dependants (max 3).
const PTKP_OPTIONS = [
  { value: "TK/0", label: "TK/0 — tidak kawin, tanpa tanggungan" },
  { value: "TK/1", label: "TK/1 — tidak kawin, 1 tanggungan" },
  { value: "TK/2", label: "TK/2 — tidak kawin, 2 tanggungan" },
  { value: "TK/3", label: "TK/3 — tidak kawin, 3 tanggungan" },
  { value: "K/0", label: "K/0 — kawin, tanpa tanggungan" },
  { value: "K/1", label: "K/1 — kawin, 1 tanggungan" },
  { value: "K/2", label: "K/2 — kawin, 2 tanggungan" },
  { value: "K/3", label: "K/3 — kawin, 3 tanggungan" },
];

const ROLE_OPTIONS = [
  { value: "karyawan", label: "Karyawan", desc: "Absen, ajukan cuti, lihat slip." },
  { value: "atasan", label: "Atasan", desc: "Menyetujui cuti tim, melihat ringkasan." },
  { value: "hr_admin", label: "HR Admin", desc: "Kelola karyawan, payroll, pengaturan." },
  { value: "super_admin", label: "Super Admin", desc: "Akses penuh termasuk instansi." },
];

const SECTIONS = [
  { id: "identitas", title: "Identitas" },
  { id: "kepegawaian", title: "Kepegawaian" },
  { id: "struktur", title: "Struktur Organisasi" },
  { id: "persetujuan", title: "Persetujuan" },
];

// Same divisor the payroll uses to illustrate a day's pay; the real figure per
// period depends on that period's working days.
const HARI_KERJA_ILUSTRASI = 22;
const RP = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <h2 id={`${id}-title`} className="mb-4 text-[0.95rem] font-bold text-foreground">
        {title}
      </h2>
      <div className="grid gap-4.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function EmployeeFormFields({
  branches,
  departments,
  approverOptions,
  defaults = {},
  emailReadOnly = false,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  defaults?: Partial<EmployeeFieldValues>;
  emailReadOnly?: boolean;
}) {
  const [role, setRole] = useState(defaults.role ?? "karyawan");
  const [gaji, setGaji] = useState(defaults.gajiPokok ?? "0");
  const gajiNum = Number(gaji);
  const isAdminRole = role === "hr_admin" || role === "super_admin";

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Bagian formulir" className="hidden flex-col lg:sticky lg:top-6 lg:flex">
        {SECTIONS.map((sec, i) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className="flex items-baseline gap-3 border-t border-border py-2.5 text-sm outline-none hover:text-brand-text focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            {sec.title}
          </a>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-5">
      <Section id="identitas" title="Identitas">
        <Field id="nama" label="Nama">
          <Input name="nama" defaultValue={defaults.nama} required />
        </Field>
        <Field
          id="email"
          label={emailReadOnly ? "Email" : "Email (opsional)"}
          hint={
            emailReadOnly
              ? undefined
              : "Kosongkan bila pegawai hanya absen lewat mesin fingerprint. Ia belum bisa masuk ke aplikasi sampai email diisi."
          }
        >
          <Input
            name="email"
            type="email"
            defaultValue={defaults.email ?? ""}
            readOnly={emailReadOnly}
            aria-readonly={emailReadOnly || undefined}
            className={emailReadOnly ? "bg-muted text-muted-foreground" : undefined}
          />
        </Field>
        <Field id="jabatan" label="Jabatan">
          <Input name="jabatan" defaultValue={defaults.jabatan} required />
        </Field>
      </Section>

      <Section id="kepegawaian" title="Kepegawaian">
        <Field
          id="statusKontrak"
          label="Status Kontrak"
          hint="Tanggal kontrak & perpanjangan diatur di tab Kontrak. Magang tidak ikut payroll."
        >
          <NativeSelect name="statusKontrak" defaultValue={defaults.statusKontrak ?? "tetap"}>
            {STATUS_KONTRAK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
            {defaults.statusKontrak && !STATUS_KONTRAK_OPTIONS.some((o) => o.value === defaults.statusKontrak) && (
              <option value={defaults.statusKontrak}>{defaults.statusKontrak} (lama)</option>
            )}
          </NativeSelect>
        </Field>
        <Field id="statusPtkp" label="Status PTKP (PPh 21)">
          <NativeSelect name="statusPtkp" defaultValue={defaults.statusPtkp ?? "TK/0"}>
            {PTKP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="tanggalMulaiKerja" label="Tanggal Mulai Kerja">
          <Input name="tanggalMulaiKerja" type="date" defaultValue={defaults.tanggalMulaiKerja} required />
        </Field>
        <Field
          id="gajiPokok"
          label="Gaji Pokok"
          hint={
            gajiNum > 0
              ? `Per bulan · sekitar ${RP.format(Math.round(gajiNum / HARI_KERJA_ILUSTRASI))} per hari kerja`
              : "Per bulan, sebelum potongan."
          }
        >
          <Input
            name="gajiPokok"
            type="number"
            min="0"
            inputMode="numeric"
            value={gaji}
            onChange={(e) => setGaji(e.target.value)}
            className="font-mono"
          />
        </Field>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Peran sistem</legend>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {ROLE_OPTIONS.map((o) => {
              const on = role === o.value;
              return (
                <label
                  key={o.value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    on ? "border-primary bg-accent" : "border-input hover:bg-muted/60",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name="role"
                      value={o.value}
                      checked={on}
                      onChange={() => setRole(o.value)}
                      className="size-4 accent-primary"
                    />
                    {o.label}
                  </span>
                  <span className="text-[0.8rem] leading-snug text-muted-foreground">{o.desc}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Section>

      <Section id="struktur" title="Struktur Organisasi">
        <Field id="branchId" label="Cabang">
          <NativeSelect id="branchId" name="branchId" defaultValue={defaults.branchId ?? ""} required>
            <option value="">Pilih cabang</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.nama}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="departmentId" label="Departemen (opsional)">
          <NativeSelect id="departmentId" name="departmentId" defaultValue={defaults.departmentId ?? ""}>
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.nama}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="atasanId" label="Atasan (opsional)">
          <NativeSelect id="atasanId" name="atasanId" defaultValue={defaults.atasanId ?? ""}>
            <option value="">—</option>
            {approverOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.nama}</option>
            ))}
          </NativeSelect>
        </Field>
      </Section>

      <Section id="persetujuan" title="Persetujuan">
        <Field
          id="designatedApproverId"
          label="Approver Pengganti"
          hint={
            isAdminRole
              ? "Wajib untuk HR Admin dan Super Admin agar cuti mereka tidak menyetujui diri sendiri."
              : "Opsional. Dipakai saat atasan langsung sedang cuti."
          }
        >
          <NativeSelect id="designatedApproverId" name="designatedApproverId" defaultValue={defaults.designatedApproverId ?? ""}>
            <option value="">—</option>
            {approverOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.nama}</option>
            ))}
          </NativeSelect>
        </Field>
      </Section>
      </div>
    </div>
  );
}
