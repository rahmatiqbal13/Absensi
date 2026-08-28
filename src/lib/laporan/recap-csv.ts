import type { RecapRow } from "./attendance-recap";

const HEADER = [
  "Nama", "Hadir", "Terlambat", "Pulang Cepat", "Di Luar Lokasi",
  "Alpa", "Cuti", "Menit Terlambat", "Hari Kerja Efektif",
];

function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function recapToCsv(rows: RecapRow[]): string {
  const lines = [HEADER.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.nama, r.hadir, r.terlambat, r.pulangCepat, r.diLuarLokasi,
        r.alpa, r.cuti, r.totalMenitTerlambat, r.hariKerjaEfektif,
      ].map(csvField).join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
