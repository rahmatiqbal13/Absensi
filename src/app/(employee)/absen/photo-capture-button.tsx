"use client";

import { useEffect, useMemo } from "react";
import { Camera } from "lucide-react";

/** Selfie capture row: thumbnail, hint and a take/retake affordance over a file input. */
export function PhotoCaptureButton({
  disabled,
  photo,
  onPhotoChange,
}: {
  disabled: boolean;
  photo: File | null;
  onPhotoChange: (file: File | null) => void;
}) {
  // createObjectURL is absent in some non-browser runtimes (jsdom) — no preview there.
  const preview = useMemo(
    () => (photo && typeof URL.createObjectURL === "function" ? URL.createObjectURL(photo) : null),
    [photo],
  );
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <label className="relative flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-border bg-card p-3 transition-colors focus-within:ring-3 focus-within:ring-brand/30 hover:border-input">
      <input
        type="file"
        accept="image/*"
        capture="user"
        aria-label="Foto selfie"
        disabled={disabled}
        onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-muted-foreground">
        {preview ? (
          // A local object URL preview — next/image does not apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <Camera className="size-6" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.95rem] font-semibold text-foreground">Foto selfie</span>
        <span className="truncate text-sm text-muted-foreground">
          {photo ? photo.name : "Kamera depan, wajah terlihat jelas"}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="inline-flex h-11 shrink-0 items-center rounded-[10px] border border-input bg-field px-4 text-sm font-semibold text-foreground"
      >
        {photo ? "Ulangi" : "Ambil foto"}
      </span>
    </label>
  );
}
