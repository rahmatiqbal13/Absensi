/** Pengajuan lembur & dinas luar (migration 0058). */
export type WorkRequestJenis = "lembur" | "dinas_luar";
export type WorkRequestStatus = "pending" | "approved" | "rejected" | "dibatalkan";

export const JENIS_LABEL: Record<WorkRequestJenis, string> = { lembur: "Lembur", dinas_luar: "Dinas luar" };
export const STATUS_LABEL: Record<WorkRequestStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  dibatalkan: "Dibatalkan",
};

export type WorkRequestInput = {
  jenis: WorkRequestJenis;
  tanggal_mulai: string;
  tanggal_selesai: string;
  jam_mulai: string | null;
  jam_selesai: string | null;
  tujuan: string | null;
  alasan: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = 86_400_000;
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Lembur may be filed up to 31 days back (forgot to file) and 60 days ahead. */
export function validateWorkRequest(
  raw: Record<string, unknown>,
  today: string,
): { ok: true; value: WorkRequestInput } | { ok: false; error: string } {
  const jenis = String(raw.jenis ?? "");
  const alasan = String(raw.alasan ?? "").trim().slice(0, 1000);
  if (jenis !== "lembur" && jenis !== "dinas_luar") return { ok: false, error: "Jenis pengajuan tidak valid." };
  if (!alasan) return { ok: false, error: jenis === "lembur" ? "Tulis pekerjaan yang dilemburkan." : "Tulis keperluan dinas luar." };
  const earliest = shift(today, -31);
  const latest = shift(today, 60);

  if (jenis === "lembur") {
    const tanggal = String(raw.tanggal ?? "");
    const mulai = String(raw.jam_mulai ?? "");
    const selesai = String(raw.jam_selesai ?? "");
    if (!DATE_RE.test(tanggal)) return { ok: false, error: "Tanggal lembur wajib diisi." };
    if (tanggal < earliest || tanggal > latest) return { ok: false, error: "Tanggal lembur paling lama 31 hari ke belakang atau 60 hari ke depan." };
    if (!TIME_RE.test(mulai) || !TIME_RE.test(selesai)) return { ok: false, error: "Isi jam mulai dan jam selesai lembur." };
    if (selesai <= mulai) return { ok: false, error: "Jam selesai harus setelah jam mulai (lembur lewat tengah malam belum didukung)." };
    return { ok: true, value: { jenis, tanggal_mulai: tanggal, tanggal_selesai: tanggal, jam_mulai: mulai, jam_selesai: selesai, tujuan: null, alasan } };
  }

  const mulai = String(raw.tanggal_mulai ?? "");
  const selesai = String(raw.tanggal_selesai ?? "") || mulai;
  const tujuan = String(raw.tujuan ?? "").trim().slice(0, 200);
  if (!DATE_RE.test(mulai) || !DATE_RE.test(selesai)) return { ok: false, error: "Isi tanggal dinas luar." };
  if (selesai < mulai) return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  if (mulai < earliest || selesai > latest) return { ok: false, error: "Dinas luar paling lama 31 hari ke belakang atau 60 hari ke depan." };
  if (!tujuan) return { ok: false, error: "Isi tujuan / lokasi dinas luar." };
  return { ok: true, value: { jenis, tanggal_mulai: mulai, tanggal_selesai: selesai, jam_mulai: null, jam_selesai: null, tujuan, alasan } };
}

/** Who may decide: the assigned approver or HR, never the requester. */
export function canDecide(
  viewer: { id: string; role: string },
  req: { employee_id: string; approver_id: string | null; status: string },
): boolean {
  if (req.status !== "pending" || req.employee_id === viewer.id) return false;
  return viewer.role === "hr_admin" || viewer.role === "super_admin" || req.approver_id === viewer.id;
}
