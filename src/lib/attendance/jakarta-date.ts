// The `tanggal` column is a calendar DATE, and this app assumes all offices
// operate in a single timezone (Asia/Jakarta) — there is no per-branch
// timezone column. Deriving that date via `date.toISOString().slice(0, 10)`
// would yield the UTC calendar date, which is the PREVIOUS day for any
// instant before 07:00 WIB; deriving it via Date.prototype.getFullYear()/
// getMonth()/getDate() would yield the EXECUTING PROCESS's local calendar
// date, which is wrong on a UTC-default cloud/serverless deployment. Both
// break the `unique (employee_id, tanggal)` invariant (one employee could
// land two clock-ins on one real workday) and orphan rows from the clock-out
// lookup. Pinning via Intl.DateTimeFormat makes the result independent of
// the process's own TZ configuration — see the equivalent rationale for
// time-of-day extraction in status.ts.
//
// The "en-CA" locale renders dates in ISO-8601 order (YYYY-MM-DD), which is
// exactly the shape Postgres expects for a DATE literal.
const JAKARTA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the Asia/Jakarta calendar date (YYYY-MM-DD) for a given instant,
 * independent of the executing process's own timezone configuration.
 */
export function toJakartaDateOnly(date: Date): string {
  return JAKARTA_DATE_FORMATTER.format(date);
}
