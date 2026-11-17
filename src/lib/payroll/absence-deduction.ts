/**
 * Whether an unexcused absent day (alpa) costs a day's wage for this employee.
 * The employee's own choice (set by a super admin) wins; null follows the
 * company setting, which defaults to off (full salary). Migration 0035.
 */
export function shouldDeductAlpa(companyDefault: boolean, employeeOverride: boolean | null | undefined): boolean {
  return employeeOverride ?? companyDefault;
}
