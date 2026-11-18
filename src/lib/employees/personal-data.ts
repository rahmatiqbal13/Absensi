/** Data diri the employee fills in themselves (Profil, migration 0056). */
export const AGAMA_OPTIONS = ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu", "Lainnya"] as const;
export const PENDIDIKAN_OPTIONS = ["SD", "SMP", "SMA/SMK", "D1", "D2", "D3", "D4", "S1", "S2", "S3"] as const;
export const JENIS_KELAMIN_LABEL = { L: "Laki-laki", P: "Perempuan" } as const;

export type PersonalData = {
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  jenis_kelamin: "L" | "P" | null;
  agama: (typeof AGAMA_OPTIONS)[number] | null;
  alamat_ktp: string | null;
  alamat_domisili: string | null;
  pendidikan_terakhir: (typeof PENDIDIKAN_OPTIONS)[number] | null;
};

const text = (v: unknown, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

export function validatePersonalData(
  raw: Record<string, unknown>,
  today: string,
): { ok: true; value: PersonalData } | { ok: false; error: string } {
  const tanggal = text(raw.tanggal_lahir, 10);
  if (tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { ok: false, error: "Tanggal lahir tidak valid." };
  if (tanggal && (tanggal < "1930-01-01" || tanggal > today)) return { ok: false, error: "Tanggal lahir di luar rentang yang wajar." };

  const jk = text(raw.jenis_kelamin, 1);
  if (jk && jk !== "L" && jk !== "P") return { ok: false, error: "Pilih jenis kelamin." };
  const agama = text(raw.agama, 20);
  if (agama && !(AGAMA_OPTIONS as readonly string[]).includes(agama)) return { ok: false, error: "Pilih agama dari daftar." };
  const pendidikan = text(raw.pendidikan_terakhir, 10);
  if (pendidikan && !(PENDIDIKAN_OPTIONS as readonly string[]).includes(pendidikan))
    return { ok: false, error: "Pilih pendidikan terakhir dari daftar." };

  return {
    ok: true,
    value: {
      tempat_lahir: text(raw.tempat_lahir, 100),
      tanggal_lahir: tanggal,
      jenis_kelamin: jk as PersonalData["jenis_kelamin"],
      agama: agama as PersonalData["agama"],
      alamat_ktp: text(raw.alamat_ktp, 300),
      alamat_domisili: text(raw.alamat_domisili, 300),
      pendidikan_terakhir: pendidikan as PersonalData["pendidikan_terakhir"],
    },
  };
}

/** "1995 04 12 · 2023 07 · 001" grouping for display; the raw value is 17 digits. */
export function formatNomorPegawai(n: string | null | undefined): string | null {
  if (!n) return null;
  return /^\d{17}$/.test(n) ? `${n.slice(0, 8)} ${n.slice(8, 14)} ${n.slice(14)}` : n;
}
