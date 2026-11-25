/**
 * Jadwal bernama (schedule_templates, migration 0067) and where each one is
 * applied. The work_schedules rows a template owns are its targets:
 *   branch default (no department, no name) → the whole branch ("jadwal utama")
 *   department row                           → that department
 *   named row                                → the employees pointing at it
 */
export type AppliedRow = {
  id: string;
  template_id: string | null;
  branch_id: string;
  department_id: string | null;
  nama: string | null;
};

export type StaffRow = { id: string; work_schedule_id: string | null };

export type TemplateUsage = { branchIds: string[]; departmentIds: string[]; employeeIds: string[] };

export function templateUsage(rows: readonly AppliedRow[], staff: readonly StaffRow[]): Map<string, TemplateUsage> {
  const out = new Map<string, TemplateUsage>();
  const of = (id: string) => {
    let u = out.get(id);
    if (!u) out.set(id, (u = { branchIds: [], departmentIds: [], employeeIds: [] }));
    return u;
  };
  const namedRowTemplate = new Map<string, string>();
  for (const r of rows) {
    if (!r.template_id) continue;
    if (r.nama) namedRowTemplate.set(r.id, r.template_id);
    else if (r.department_id) of(r.template_id).departmentIds.push(r.department_id);
    else of(r.template_id).branchIds.push(r.branch_id);
  }
  for (const e of staff) {
    const t = e.work_schedule_id ? namedRowTemplate.get(e.work_schedule_id) : undefined;
    if (t) of(t).employeeIds.push(e.id);
  }
  return out;
}

/** Branches with no jadwal utama: their employees without a department / own schedule cannot be judged late. */
export function branchesWithoutSchedule<B extends { id: string }>(branches: readonly B[], rows: readonly AppliedRow[]): B[] {
  const covered = new Set(rows.filter((r) => !r.department_id && !r.nama).map((r) => r.branch_id));
  return branches.filter((b) => !covered.has(b.id));
}

// Monday-first, as on a work-week calendar; values stay 0=Sun..6=Sat.
const HARI = [
  { v: 1, label: "Sen" }, { v: 2, label: "Sel" }, { v: 3, label: "Rab" }, { v: 4, label: "Kam" },
  { v: 5, label: "Jum" }, { v: 6, label: "Sab" }, { v: 0, label: "Min" },
];

/** "Sen–Jum", "Sel–Min", or a list when the days are not consecutive. */
export function summarizeDays(hariKerja: readonly number[]): string {
  const idx = HARI.map((d, i) => (hariKerja.includes(d.v) ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) return "—";
  if (idx.length === 7) return "Setiap hari";
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (consecutive && idx.length >= 3) return `${HARI[idx[0]].label}–${HARI[idx[idx.length - 1]].label}`;
  return idx.map((i) => HARI[i].label).join(", ");
}

export function summarizeSchedule(s: { jamMasuk: string; jamPulang: string; hariKerja: readonly number[] }): string {
  return `${s.jamMasuk}–${s.jamPulang} · ${summarizeDays(s.hariKerja)}`;
}

/** Reads the RPC's "cabang_tanpa_jadwal: A, B" refusal into a sentence for HR. */
export function templateTargetsError(message: string | undefined): string | null {
  const m = /cabang_tanpa_jadwal: (.+)/.exec(message ?? "");
  if (!m) return null;
  return `Cabang ${m[1]} harus tetap punya jadwal utama. Untuk memindahkannya, buka jadwal lain dan centang cabang tersebut di sana.`;
}
