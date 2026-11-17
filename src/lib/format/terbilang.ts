const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

function bawahSeribu(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${SATUAN[n - 10]} belas`;
  if (n < 100) return [`${SATUAN[Math.floor(n / 10)]} puluh`, SATUAN[n % 10]].filter(Boolean).join(" ");
  const ratus = Math.floor(n / 100);
  const sisa = n % 100;
  return [ratus === 1 ? "seratus" : `${SATUAN[ratus]} ratus`, sisa ? bawahSeribu(sisa) : ""].filter(Boolean).join(" ");
}

const SKALA = ["", "ribu", "juta", "miliar", "triliun"];

/** Whole number in Indonesian words: 1_250_000 -> "satu juta dua ratus lima puluh ribu". */
export function terbilang(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "nol";
  const parts: string[] = [];
  for (let i = 0; n > 0 && i < SKALA.length; i++) {
    const chunk = n % 1000;
    if (chunk) {
      const words = i === 1 && chunk === 1 ? "seribu" : [bawahSeribu(chunk), SKALA[i]].filter(Boolean).join(" ");
      parts.unshift(words);
    }
    n = Math.floor(n / 1000);
  }
  return (value < 0 ? "minus " : "") + parts.join(" ");
}

/** "Sembilan juta sembilan ratus ribu rupiah" — capitalised, rounded to whole rupiah. */
export function terbilangRupiah(value: number): string {
  const s = `${terbilang(Math.round(value))} rupiah`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
