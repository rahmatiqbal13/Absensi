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
      }
    } catch {
      setError("Gagal mengambil lokasi. Pastikan GPS aktif dan izin lokasi diberikan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (todaysAttendance?.jamPulang) {
    return (
      <div className="rounded border p-6 text-center">
        <p className="text-base font-medium">Absensi hari ini selesai.</p>
        <div className="mt-2 flex justify-center">
          <AttendanceStatusBadge status={todaysAttendance.status} />
        </div>
      </div>
    );
  }

  if (todaysAttendance?.jamMasuk) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <AttendanceStatusBadge status={todaysAttendance.status} />
        <PhotoCaptureButton
          label="Absen Pulang"
          disabled={submitting}
          onPhotoChange={setPhoto}
          onSubmit={() => handleClock("pulang")}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <PhotoCaptureButton
        label="Absen Masuk"
        disabled={submitting}
        onPhotoChange={setPhoto}
        onSubmit={() => handleClock("masuk")}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PhotoCaptureButton({
  label,
  disabled,
  onPhotoChange,
  onSubmit,
}: {
  label: string;
  disabled: boolean;
  onPhotoChange: (file: File | null) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      <input
        type="file"
        accept="image/*"
        capture="user"
        aria-label="Foto selfie"
        disabled={disabled}
        onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        className="flex min-h-16 w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-4 text-lg font-semibold text-white disabled:opacity-60"
      >
        {label}
      </button>
    </div>
  );
}
