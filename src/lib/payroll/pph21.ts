import { round2 } from "./round";

export const DEFAULT_TARIF_PPH21_PERSEN = 1;

/**
 * Flat-rate PPh 21 withholding (migration 0036). The base is the wage actually
 * earned in the month — gaji pokok minus attendance deductions — never below 0.
 */
export function pph21(penghasilanBruto: number, tarifPersen: number): number {
  if (!(penghasilanBruto > 0) || !(tarifPersen > 0)) return 0;
  return round2((penghasilanBruto * tarifPersen) / 100);
}

/** "1%", "0,5%" — Indonesian decimal comma. */
export function formatPersen(tarif: number): string {
  return `${Number(tarif.toFixed(2)).toString().replace(".", ",")}%`;
}
