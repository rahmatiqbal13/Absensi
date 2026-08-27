// Half-up rounding to 2 decimal places. The + Number.EPSILON nudge keeps
// values like 2.675 (stored as 2.67499999…) from rounding down.
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
