"use client";

import { useState } from "react";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import type { AttendanceStatus } from "@/lib/attendance/status";
import { cn } from "@/lib/utils";
import { Camera, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">Absensi hari ini selesai.</p>
          <AttendanceStatusBadge status={todaysAttendance.status} />
        </CardContent>
      </Card>
    );
  }

  if (todaysAttendance?.jamMasuk) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-5 py-6">
          <AttendanceStatusBadge status={todaysAttendance.status} />
          <PhotoCaptureButton
            label="Absen Pulang"
            disabled={submitting}
            photo={photo}
            onPhotoChange={setPhoto}
            onSubmit={() => handleClock("pulang")}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-6">
        <PhotoCaptureButton
          label="Absen Masuk"
          disabled={submitting}
          photo={photo}
          onPhotoChange={setPhoto}
          onSubmit={() => handleClock("masuk")}
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
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
          className={cn("size-6", photo ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground")}
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-foreground">
          {photo ? photo.name : "Ambil foto selfie"}
        </span>
      </label>
      <Button
        type="button"
        size="lg"
        disabled={disabled || !photo}
        onClick={onSubmit}
        className="min-h-16 w-full text-lg"
      >
        {label}
      </Button>
    </div>
  );
}
