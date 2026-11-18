/**
 * Makes an uploaded logo fit the 512 KB server limit and work everywhere it is
 * shown. Runs in the browser before upload.
 *
 * - A PNG/JPG already under the limit is uploaded untouched (no quality loss).
 * - Anything else (too big, WEBP, SVG) is redrawn as a PNG: transparency is
 *   kept, and the PDF renderer, which can't read WEBP or SVG, can use it.
 *   Longest side 512 px first (the logo is shown at most ~64 px, so this is
 *   plenty even for retina), smaller steps only if it is still too big.
 */
export const LOGO_MAX_BYTES = 512 * 1024;
const EDGES = [512, 384, 256];

export type PreparedLogo =
  | { ok: true; file: File; compressed: boolean }
  | { ok: false; error: string };

const PDF_SAFE = new Set(["image/png", "image/jpeg"]);

export function needsLogoProcessing(file: File): boolean {
  return !PDF_SAFE.has(file.type) || file.size > LOGO_MAX_BYTES;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  // SVG: createImageBitmap can't take it everywhere; an <img> can.
  if (file.type === "image/svg+xml" || typeof createImageBitmap !== "function") {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth || 512,
      height: img.naturalHeight || 512,
      release: () => URL.revokeObjectURL(url),
    };
  }
  const bitmap = await createImageBitmap(file);
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function prepareLogo(file: File): Promise<PreparedLogo> {
  if (!needsLogoProcessing(file)) return { ok: true, file, compressed: false };

  const tooBig = { ok: false as const, error: "Logo terlalu besar dan tidak bisa dikompres di browser ini. Gunakan PNG/JPG di bawah 512 KB." };
  if (typeof document === "undefined") return file.size <= LOGO_MAX_BYTES ? { ok: true, file, compressed: false } : tooBig;

  let img: Awaited<ReturnType<typeof decode>>;
  try {
    img = await decode(file);
  } catch (e) {
    console.error("prepareLogo: decode failed", e);
    return file.size <= LOGO_MAX_BYTES ? { ok: true, file, compressed: false } : tooBig;
  }

  try {
    for (const edge of EDGES) {
      const scale = Math.min(1, edge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
      const blob = await toPng(canvas);
      if (blob && blob.size <= LOGO_MAX_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") + ".png";
        return { ok: true, file: new File([blob], name, { type: "image/png" }), compressed: true };
      }
    }
  } catch (e) {
    console.error("prepareLogo: encode failed", e);
  } finally {
    img.release();
  }
  return file.size <= LOGO_MAX_BYTES ? { ok: true, file, compressed: false } : tooBig;
}
