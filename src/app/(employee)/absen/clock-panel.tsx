"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import type { AttendanceStatus } from "@/lib/attendance/status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { ProximityPanel, type BranchGeofence } from "./proximity-panel";
import { PhotoCaptureButton } from "./photo-capture-button";
import { TodayTimeline, formatClockTime } from "./today-timeline";

export type TodaysAttendance = {
  jamMasuk: string;
  jamPulang: string | null;
  status: AttendanceStatus;
} | null;

export type WorkShift = { jamMasuk: string; toleransiMenit: number } | null;

type ActionResult = { ok: true; status: AttendanceStatus } | { ok: false; error: string };

type GeoSummary = {
  status: "prompt" | "watching" | "granted" | "denied" | "unavailable";
  configured: boolean;
  withinRadius: boolean;
  hasFix: boolean;
};

/** Elapsed time since `startIso` as "3j 20m" (hours dropped when 0, e.g. "12m"). */
function computeDuration(startIso: string): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(startIso).getTime()) / 60_000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m`;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject);
  });
}

export function ClockPanel({
  todaysAttendance,
  office,
  shift,
  submitClockIn,
  submitClockOut,
}: {
  todaysAttendance: TodaysAttendance;
  office: BranchGeofence;
  shift: WorkShift;
  submitClockIn: (formData: FormData) => Promise<ActionResult>;
  submitClockOut: (formData: FormData) => Promise<ActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [geo, setGeo] = useState<GeoSummary>({
    status: "prompt",
    configured: !(office.lat === 0 && office.long === 0),
    withinRadius: false,
    hasFix: false,
  });

  // ProximityPanel calls `onGeoChange` from inside an effect whose deps include
  // it — the handler MUST be referentially stable or the panel re-runs its
  // effect forever. `setGeo` from useState is already stable; wrapping it in a
  // `useCallback(_, [])` keeps that guarantee explicit.
  const onGeoChange = useCallback((next: GeoSummary) => setGeo(next), []);

  const done = Boolean(todaysAttendance?.jamPulang);
  const clockedIn = !done && Boolean(todaysAttendance?.jamMasuk);

  // Re-render the running work-duration line once a minute while clocked in.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!clockedIn) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [clockedIn]);

  const reasonRequired =
    (geo.configured && geo.hasFix && !geo.withinRadius) ||
    geo.status === "denied" ||
    geo.status === "unavailable";

  const reasonHelp =
    geo.status === "denied" || geo.status === "unavailable"
      ? "Lokasi tidak terbaca. Isi alasan untuk tetap absen."
      : "Anda terdeteksi di luar radius kantor. Jelaskan alasannya.";

  const submitDisabled = submitting || !photo || (reasonRequired && !reason.trim());
  const disabledHint = !photo
    ? "Ambil foto selfie dulu."
    : reasonRequired && !reason.trim()
      ? "Isi alasan dulu."
      : null;

  async function handleClock(kind: "masuk" | "pulang") {
    setError(null);
    setSubmitting(true);
    try {
      const position = await getPosition();
      const formData = new FormData();
      formData.set("lat", String(position.coords.latitude));
      formData.set("long", String(position.coords.longitude));
      if (photo) formData.set("photo", photo);
      const catatan = reason.trim();
      if (catatan) formData.set("catatan", catatan);

      const action = kind === "masuk" ? submitClockIn : submitClockOut;
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setPhoto(null);
        setReason("");
      }
    } catch {
      setError("Gagal mengambil lokasi. Pastikan GPS aktif dan izin lokasi diberikan.");
    } finally {
      setSubmitting(false);
    }
  }

  const shiftLine = shift ? (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="size-3.5" aria-hidden="true" />
      Masuk {shift.jamMasuk} · toleransi {shift.toleransiMenit} mnt
    </p>
  ) : null;

  if (done && todaysAttendance) {
    return (
      <div className="space-y-4">
        {shiftLine}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2
              className="size-10 text-emerald-600 dark:text-emerald-500"
              aria-hidden="true"
            />
            <p className="text-base font-medium text-foreground">Absensi hari ini selesai.</p>
            <AttendanceStatusBadge status={todaysAttendance.status} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <TodayTimeline
              jamMasuk={todaysAttendance.jamMasuk}
              jamPulang={todaysAttendance.jamPulang}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const label = clockedIn ? "Absen Pulang" : "Absen Masuk";

  return (
    <div className="space-y-4">
      {shiftLine}

      <Card>
        <CardContent className="flex flex-col gap-5 py-6">
          {clockedIn && todaysAttendance && (
            <div className="flex flex-col items-center gap-2">
              <AttendanceStatusBadge status={todaysAttendance.status} />
              <p className="text-sm text-muted-foreground">
                {formatClockTime(todaysAttendance.jamMasuk)} · sudah{" "}
                {computeDuration(todaysAttendance.jamMasuk)}
              </p>
            </div>
          )}

          <ProximityPanel office={office} onGeoChange={onGeoChange} />

          <PhotoCaptureButton disabled={submitting} photo={photo} onPhotoChange={setPhoto} />

          {reasonRequired && (
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 space-y-1.5">
              <label htmlFor="clock-reason" className="text-sm font-medium text-foreground">
                Alasan
              </label>
              <Textarea
                id="clock-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Tulis alasan Anda…"
              />
              <p className="text-xs text-muted-foreground">{reasonHelp}</p>
            </div>
          )}

          <div className="flex flex-col items-center gap-1.5">
            <Button
              type="button"
              size="lg"
              disabled={submitDisabled}
              onClick={() => handleClock(clockedIn ? "pulang" : "masuk")}
              className="min-h-16 w-full text-lg"
            >
              {label}
            </Button>
            {disabledHint && <p className="text-xs text-muted-foreground">{disabledHint}</p>}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5">
          <TodayTimeline
            jamMasuk={todaysAttendance?.jamMasuk ?? null}
            jamPulang={todaysAttendance?.jamPulang ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
