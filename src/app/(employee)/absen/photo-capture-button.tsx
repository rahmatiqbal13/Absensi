"use client";

import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

/** Selfie capture control: an image file input styled as a dashed drop target. */
export function PhotoCaptureButton({
  disabled,
  photo,
  onPhotoChange,
}: {
  disabled: boolean;
  photo: File | null;
  onPhotoChange: (file: File | null) => void;
}) {
  return (
    <label className="relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5">
      <input
        type="file"
        accept="image/*"
        capture="user"
        aria-label="Foto selfie"
        disabled={disabled}
        onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <Camera
        className={cn(
          "size-6",
          photo ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-foreground">
        {photo ? photo.name : "Ambil foto selfie"}
      </span>
    </label>
  );
}
