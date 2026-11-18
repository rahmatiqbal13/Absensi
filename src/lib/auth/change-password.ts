/** Rules for changing one's own password (same 8-char minimum as set-password). */
export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordChange(input: {
  current: string;
  next: string;
  confirm: string;
}): { ok: true } | { ok: false; error: string } {
  if (!input.current) return { ok: false, error: "Isi kata sandi saat ini." };
  if (input.next.length < MIN_PASSWORD_LENGTH)
    return { ok: false, error: `Kata sandi baru minimal ${MIN_PASSWORD_LENGTH} karakter.` };
  if (input.next !== input.confirm) return { ok: false, error: "Konfirmasi kata sandi baru tidak cocok." };
  if (input.next === input.current) return { ok: false, error: "Kata sandi baru harus berbeda dari yang lama." };
  return { ok: true };
}
