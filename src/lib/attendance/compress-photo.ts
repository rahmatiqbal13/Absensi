/**
 * Shrinks a camera selfie before upload. Phone cameras produce 2–5 MB files,
 * above the 1 MB Server Action default and close to the hosting request cap;
 * 1280 px JPEG is plenty for an attendance photo and is typically < 400 KB.
 *
 * Returns the original file when it is already small or when the browser
 * cannot decode/encode it (never blocks a clock-in on compression).
 */
export const MAX_EDGE_PX = 1280;
export const SKIP_BELOW_BYTES = 600 * 1024;

/** Whether `compressPhoto` would do any work — small files are used as-is. */
export function needsCompression(file: File): boolean {
  return file.size > SKIP_BELOW_BYTES;
}

export async function compressPhoto(file: File, maxEdge = MAX_EDGE_PX, quality = 0.8): Promise<File> {
  if (!needsCompression(file)) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    // imageOrientation: honour EXIF rotation so the selfie isn't sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

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
