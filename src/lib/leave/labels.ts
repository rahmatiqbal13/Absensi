export const LEAVE_JENIS_LABELS: Record<string, string> = {
  tahunan: "Cuti Tahunan", sakit: "Sakit", melahirkan: "Melahirkan", keguguran: "Keguguran",
  menikah: "Menikah", menikahkan_anak: "Menikahkan Anak", khitan_baptis_anak: "Khitan/Baptis Anak",
  istri_melahirkan_keguguran: "Istri Melahirkan/Keguguran",
  kematian_keluarga_inti: "Kematian Keluarga Inti",
  kematian_keluarga_serumah: "Kematian Keluarga Serumah", lainnya: "Lainnya",
};

export function leaveJenisLabel(jenis: string): string {
  return LEAVE_JENIS_LABELS[jenis] ?? jenis;
}

function fmt(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function formatLeaveRange(from: string, to: string): string {
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}
