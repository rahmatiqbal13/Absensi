import { readFile } from "node:fs/promises";
import path from "node:path";

let cached: string | null | undefined;

/**
 * The "absensi" product mark as a PNG data URL, for PDFs when no instansi logo
 * was uploaded. react-pdf's <Image> can't render SVG, hence the PNG copy in
 * /public. Returns null (no logo) if the file is missing.
 */
export async function productLogoDataUrl(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "logo-mark.png"));
    cached = `data:image/png;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn("productLogoDataUrl: logo-mark.png unavailable", e);
    cached = null;
  }
  return cached;
}
