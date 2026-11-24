/**
 * Guesses which employee a machine name belongs to ("yudi" -> "Yudi Santoso").
 * Only a single unambiguous match is suggested; HR still confirms it.
 */
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

export function suggestEmployee<T extends { id: string; nama: string }>(namaMesin: string, employees: readonly T[]): T | null {
  const target = words(namaMesin);
  if (target.length === 0) return null;
  const full = target.join(" ");
  const exact = employees.filter((e) => words(e.nama).join(" ") === full);
  if (exact.length === 1) return exact[0];
  // Every word of the machine name appears in the employee's name.
  const partial = employees.filter((e) => {
    const w = words(e.nama);
    return target.every((t) => w.includes(t));
  });
  return partial.length === 1 ? partial[0] : null;
}
