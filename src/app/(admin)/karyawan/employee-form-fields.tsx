"use client";

import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type EmployeeFieldValues = {
  nama: string; email: string; jabatan: string; statusKontrak: string;
  tanggalMulaiKerja: string; gajiPokok: string; role: string;
  branchId: string; departmentId: string; atasanId: string; designatedApproverId: string;
};

const ROLE_OPTIONS = [
  { value: "karyawan", label: "Karyawan" },
  { value: "atasan", label: "Atasan" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "super_admin", label: "Super Admin" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
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
  return (
    <div className="space-y-6">
      <Section title="Identitas">
        <Field id="nama" label="Nama">
          <Input name="nama" defaultValue={defaults.nama} required />
        </Field>
        <Field id="email" label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={defaults.email}
            required
            readOnly={emailReadOnly}
            aria-readonly={emailReadOnly || undefined}
            className={emailReadOnly ? "bg-muted text-muted-foreground" : undefined}
          />
        </Field>
        <Field id="jabatan" label="Jabatan">
          <Input name="jabatan" defaultValue={defaults.jabatan} required />
        </Field>
      </Section>

      <Section title="Kepegawaian">
        <Field id="statusKontrak" label="Status Kontrak">
          <Input name="statusKontrak" defaultValue={defaults.statusKontrak ?? "tetap"} />
        </Field>
        <Field id="tanggalMulaiKerja" label="Tanggal Mulai Kerja">
          <Input name="tanggalMulaiKerja" type="date" defaultValue={defaults.tanggalMulaiKerja} required />
        </Field>
        <Field id="gajiPokok" label="Gaji Pokok">
          <Input name="gajiPokok" type="number" min="0" inputMode="numeric" defaultValue={defaults.gajiPokok ?? "0"} />
        </Field>
        <Field id="role" label="Role">
          <NativeSelect id="role" name="role" defaultValue={defaults.role ?? "karyawan"}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        </Field>
      </Section>

      <Section title="Struktur Organisasi">
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

      <Section title="Persetujuan">
        <Field id="designatedApproverId" label="Approver Pengganti (wajib utk HR/Super Admin)">
          <NativeSelect id="designatedApproverId" name="designatedApproverId" defaultValue={defaults.designatedApproverId ?? ""}>
            <option value="">—</option>
            {approverOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.nama}</option>
            ))}
          </NativeSelect>
        </Field>
      </Section>
    </div>
  );
}
