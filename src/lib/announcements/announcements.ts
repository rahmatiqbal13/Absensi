export type Sasaran = "semua" | "cabang" | "departemen";

export type AnnouncementInput = {
  judul: string;
  isi: string;
  sasaran: Sasaran;
  branch_id: string | null;
  department_id: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateAnnouncement(raw: Record<string, unknown>): { ok: true; value: AnnouncementInput } | { ok: false; error: string } {
  const judul = String(raw.judul ?? "").trim();
  const isi = String(raw.isi ?? "").trim();
  const sasaran = String(raw.sasaran ?? "semua") as Sasaran;
  if (!judul) return { ok: false, error: "Judul wajib diisi." };
  if (judul.length > 150) return { ok: false, error: "Judul maksimal 150 karakter." };
  if (!isi) return { ok: false, error: "Isi pengumuman wajib diisi." };
  if (isi.length > 5000) return { ok: false, error: "Isi maksimal 5.000 karakter." };
  if (sasaran === "semua") return { ok: true, value: { judul, isi, sasaran, branch_id: null, department_id: null } };
  if (sasaran === "cabang") {
    const b = String(raw.branch_id ?? "");
    if (!UUID_RE.test(b)) return { ok: false, error: "Pilih cabang." };
    return { ok: true, value: { judul, isi, sasaran, branch_id: b, department_id: null } };
  }
  if (sasaran === "departemen") {
    const d = String(raw.department_id ?? "");
    if (!UUID_RE.test(d)) return { ok: false, error: "Pilih departemen." };
    return { ok: true, value: { judul, isi, sasaran, branch_id: null, department_id: d } };
  }
  return { ok: false, error: "Pilih sasaran pengumuman." };
}

/** Who an announcement is for, among active employees. */
export function recipientsOf(
  a: Pick<AnnouncementInput, "sasaran" | "branch_id" | "department_id">,
  employees: readonly { id: string; branch_id: string; department_id: string | null }[],
  excludeId?: string,
): string[] {
  return employees
    .filter((e) => e.id !== excludeId)
    .filter((e) =>
      a.sasaran === "semua" ? true : a.sasaran === "cabang" ? e.branch_id === a.branch_id : e.department_id === a.department_id,
    )
    .map((e) => e.id);
}

/** First ~140 characters on one line, for the bell / push text. */
export function preview(isi: string, max = 140): string {
  const flat = isi.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
