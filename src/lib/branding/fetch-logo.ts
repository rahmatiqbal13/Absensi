const MAX_BYTES = 1024 * 1024;

/**
 * Fetches an org logo and returns it as a `data:` URL for embedding in a
 * server-rendered PDF. Returns null for a null input or ANY failure (bad
 * status, oversized, timeout, network) — the caller renders the org name only.
 */
export async function fetchLogoDataUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.error("fetchLogoDataUrl: failed", err);
    return null;
  }
}
