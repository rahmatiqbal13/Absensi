import { scheduleMinutes } from "@/lib/payroll/minutes";

export type ScheduleInput = {
  jamMasuk: string;
  jamPulang: string;
  hariKerja: number[];
  toleransiMenit: number;
};

const HHMM = /^\d{2}:\d{2}$/;

export function validateScheduleInput(
  raw: Record<string, FormDataEntryValue | null> & { hariKerja?: unknown },
): { ok: true; value: ScheduleInput } | { ok: false; error: string } {
  const jamMasuk = String(raw.jamMasuk ?? "").trim();
  const jamPulang = String(raw.jamPulang ?? "").trim();

  if (!HHMM.test(jamMasuk) || !HHMM.test(jamPulang)) {
    return { ok: false, error: "Jam masuk dan jam pulang harus format HH:MM." };
  }
  if (scheduleMinutes(jamPulang) <= scheduleMinutes(jamMasuk)) {
    return { ok: false, error: "Jam pulang harus setelah jam masuk." };
  }

  const rawDays = raw.hariKerja;
  const dayList = Array.isArray(rawDays) ? rawDays : rawDays == null || rawDays === "" ? [] : [rawDays];
  const hariKerja = dayList.map((d) => Number(d));
  if (hariKerja.length === 0) {
    return { ok: false, error: "Pilih minimal satu hari kerja." };
  }
  if (hariKerja.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return { ok: false, error: "Hari kerja tidak valid." };
  }

  const toleransiMenit = Number(String(raw.toleransiMenit ?? "").trim() || "0");
  if (!Number.isInteger(toleransiMenit) || toleransiMenit < 0) {
    return { ok: false, error: "Toleransi keterlambatan harus angka >= 0." };
  }

  return { ok: true, value: { jamMasuk, jamPulang, hariKerja, toleransiMenit } };
}
