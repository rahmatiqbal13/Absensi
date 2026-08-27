export type EffectiveWorkDaysInput = {
  year: number;
  month: number; // 1-12
  hariKerja: number[]; // work_schedules.hari_kerja, 0=Sun..6=Sat (getUTCDay convention)
  holidayDates: string[]; // "YYYY-MM-DD", already filtered to those that apply to the branch
  joinDate?: string | null; // employees.tanggal_mulai_kerja, "YYYY-MM-DD"
};

export type EffectiveWorkDays = {
  fullMonthDays: string[];
  accrualDays: string[];
};

export function effectiveWorkDays(input: EffectiveWorkDaysInput): EffectiveWorkDays {
  const { year, month, hariKerja, holidayDates, joinDate } = input;
  const workingDow = new Set(hariKerja);
  const holidays = new Set(holidayDates);
  // Day 0 of the next month === last day of this month.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const fullMonthDays: string[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    if (!workingDow.has(dow)) continue;
    if (holidays.has(dateStr)) continue;
    fullMonthDays.push(dateStr);
  }

  const accrualDays = joinDate
    ? fullMonthDays.filter((d) => d >= joinDate)
    : fullMonthDays;

  return { fullMonthDays, accrualDays };
}
