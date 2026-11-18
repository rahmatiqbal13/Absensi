/**
 * True when a PostgREST error is "column does not exist" — Postgres 42703 on a
 * read, PGRST204 ("not in the schema cache") on an insert/update — i.e. the
 * code is ahead of the database and a migration has not run yet.
 */
export function isMissingColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  return e.code === "42703" || e.code === "PGRST204" || (typeof e.message === "string" && /column .* does not exist/i.test(e.message));
}

/**
 * Logs an optional-feature lookup failure. A not-yet-applied migration is a
 * warning with a hint (the caller already degrades gracefully); anything else
 * is a real error.
 */
export function logOptionalLookup(where: string, error: unknown, migration: string): void {
  if (isMissingColumn(error)) {
    console.warn(`${where}: kolom belum ada — jalankan migrasi ${migration}. Fitur ini dilewati sementara.`);
  } else {
    console.error(`${where}: lookup failed`, error);
  }
}
