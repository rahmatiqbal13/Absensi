/** Center-crop rectangle for turning a w×h image into a square. Pure. */
export function centerCropRect(w: number, h: number): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h);
  return { sx: Math.floor((w - size) / 2), sy: Math.floor((h - size) / 2), size };
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Client only. Loads `file`, center-crops to square, scales to `dim`×`dim`,
 * returns a JPEG Blob. Rejects a non-image / undecodable file.
 */
export async function resizeToSquareJpeg(
  file: File,
  dim = 512,
  quality = 0.8,
): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error("Foto harus JPG, PNG, atau WEBP.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Berkas gambar tidak dapat dibaca.");
  }
  const { sx, sy, size } = centerCropRect(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tidak dapat memproses gambar.");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, dim, dim);
  bitmap.close();
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  if (!blob) throw new Error("Tidak dapat memproses gambar.");
  return blob;
}
