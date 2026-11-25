/**
 * Shrinks a camera selfie before upload. Phone cameras produce 2–5 MB files,
 * above the 1 MB Server Action default and close to the hosting request cap.
 * An attendance selfie only has to show a face and the surroundings to HR:
 * 800 px at JPEG 0.75 does that at roughly 60–150 KB, a third of the earlier
 * 1280 px / 0.8 (±300 KB) — faster on a weak signal, and it is what the photo
 * storage (90 days, 0025) and egress are billed on.
 *
 * Returns the original file when it is already small or when the browser
 * cannot decode/encode it (never blocks a clock-in on compression).
 */
export const MAX_EDGE_PX = 800;
export const JPEG_QUALITY = 0.75;
export const SKIP_BELOW_BYTES = 250 * 1024;

/** Whether `compressPhoto` would do any work — small files are used as-is. */
export function needsCompression(file: File): boolean {
  return file.size > SKIP_BELOW_BYTES;
}

/** Size that fits `maxEdge` on the longer side, keeping the aspect ratio; never upscales. */
export function scaledSize(width: number, height: number, maxEdge = MAX_EDGE_PX): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressPhoto(file: File, maxEdge = MAX_EDGE_PX, quality = JPEG_QUALITY): Promise<File> {
  if (!needsCompression(file)) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    // imageOrientation: honour EXIF rotation so the selfie isn't sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch (e) {
    console.error("compressPhoto failed, uploading original", e);
    return file;
  }
}
