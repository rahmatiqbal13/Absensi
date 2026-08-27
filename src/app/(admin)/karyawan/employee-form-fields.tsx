"use client";

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

const inputCls = "w-full rounded border border-neutral-300 px-3 py-2 text-base";

export function EmployeeFormFields({
  branches,
  departments,
  approverOptions,
  defaults = {},
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  defaults?: Partial<EmployeeFieldValues>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Nama
        <input name="nama" defaultValue={defaults.nama} required className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Email
        <input name="email" type="email" defaultValue={defaults.email} required className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Jabatan
        <input name="jabatan" defaultValue={defaults.jabatan} required className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Status Kontrak
        <input name="statusKontrak" defaultValue={defaults.statusKontrak ?? "tetap"} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Tanggal Mulai Kerja
        <input name="tanggalMulaiKerja" type="date" defaultValue={defaults.tanggalMulaiKerja} required className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Gaji Pokok
        <input name="gajiPokok" type="number" min="0" defaultValue={defaults.gajiPokok ?? "0"} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Role
        <select name="role" defaultValue={defaults.role ?? "karyawan"} className={inputCls}>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Cabang
        <select name="branchId" defaultValue={defaults.branchId ?? ""} required className={inputCls}>
          <option value="">Pilih cabang</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Departemen (opsional)
        <select name="departmentId" defaultValue={defaults.departmentId ?? ""} className={inputCls}>
          <option value="">—</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Atasan (opsional)
        <select name="atasanId" defaultValue={defaults.atasanId ?? ""} className={inputCls}>
          <option value="">—</option>
          {approverOptions.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Approver Pengganti (wajib utk HR/Super Admin)
        <select name="designatedApproverId" defaultValue={defaults.designatedApproverId ?? ""} className={inputCls}>
          <option value="">—</option>
          {approverOptions.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}
        </select>
      </label>
    </div>
  );
}
