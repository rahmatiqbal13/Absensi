import { createHmac, timingSafeEqual } from "node:crypto";

export const QR_WINDOW_MS = 30_000;

function tokenForWindow(secret: string, win: number): string {
  return createHmac("sha256", secret).update(String(win)).digest("hex").slice(0, 16);
}

export function qrToken(secret: string, now: number = Date.now()): string {
  return tokenForWindow(secret, Math.floor(now / QR_WINDOW_MS));
}

export function verifyQrToken(secret: string, token: string, now: number = Date.now()): boolean {
  // A short or missing secret is never a real minted secret (setBranchQr /
  // resetKioskKey write 64 hex chars) — reject rather than HMAC with weak keying.
  if (!secret || secret.length < 32) return false;
  if (!/^[0-9a-f]{16}$/.test(token)) return false;
  const win = Math.floor(now / QR_WINDOW_MS);
  const candidates = [tokenForWindow(secret, win), tokenForWindow(secret, win - 1)];
  const got = Buffer.from(token);
  return candidates.some((c) => {
    const buf = Buffer.from(c);
    return buf.length === got.length && timingSafeEqual(buf, got);
  });
}

export function windowRemainingMs(now: number = Date.now()): number {
  return QR_WINDOW_MS - (now % QR_WINDOW_MS);
}
