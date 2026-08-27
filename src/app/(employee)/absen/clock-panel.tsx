"use client";

import { useState } from "react";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import type { AttendanceStatus } from "@/lib/attendance/status";

export type TodaysAttendance = {
  jamMasuk: string;
  jamPulang: string | null;
  status: AttendanceStatus;
} | null;

type ActionResult = { ok: true; status: AttendanceStatus } | { ok: false; error: string };

export function ClockPanel({
  todaysAttendance,
  submitClockIn,
  submitClockOut,
}: {
  todaysAttendance: TodaysAttendance;
  submitClockIn: (formData: FormData) => Promise<ActionResult>;
  submitClockOut: (formData: FormData) => Promise<ActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);

  function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
  }

  async function handleClock(kind: "masuk" | "pulang") {
    setError(null);
    setSubmitting(true);
    try {
      const position = await getPosition();
      const formData = new FormData();
      formData.set("lat", String(position.coords.latitude));
      formData.set("long", String(position.coords.longitude));
      if (photo) formData.set("photo", photo);

      const action = kind === "masuk" ? submitClockIn : submitClockOut;
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setPhoto(null);
      }
    } catch {
      setError("Gagal mengambil lokasi. Pastikan GPS aktif dan izin lokasi diberikan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (todaysAttendance?.jamPulang) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <svg
          aria-hidden="true"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="mx-auto mb-3 text-green-600"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.3 2.3L15.5 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-base font-medium text-neutral-900">Absensi hari ini selesai.</p>
        <div className="mt-3 flex justify-center">
          <AttendanceStatusBadge status={todaysAttendance.status} />
        </div>
      </div>
    );
  }

  if (todaysAttendance?.jamMasuk) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <AttendanceStatusBadge status={todaysAttendance.status} />
        <PhotoCaptureButton
          label="Absen Pulang"
          disabled={submitting}
          photo={photo}
          onPhotoChange={setPhoto}
          onSubmit={() => handleClock("pulang")}
        />
        {error && <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
      <PhotoCaptureButton
        label="Absen Masuk"
        disabled={submitting}
        photo={photo}
        onPhotoChange={setPhoto}
        onSubmit={() => handleClock("masuk")}
      />
      {error && <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PhotoCaptureButton({
  label,
  disabled,
  photo,
  onPhotoChange,
  onSubmit,
}: {
  label: string;
  disabled: boolean;
  photo: File | null;
  onPhotoChange: (file: File | null) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <label className="relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-5 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40">
        <input
          type="file"
          accept="image/*"
          capture="user"
          aria-label="Foto selfie"
          disabled={disabled}
          onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <svg
          aria-hidden="true"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={photo ? "text-green-600" : "text-neutral-400"}
        >
          <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
        <span className="text-sm font-medium text-neutral-700">
          {photo ? photo.name : "Ambil foto selfie"}
        </span>
      </label>
      <button
        type="button"
        disabled={disabled || !photo}
        onClick={onSubmit}
        className="flex min-h-16 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none"
      >
        {label}
      </button>
    </div>
  );
}
