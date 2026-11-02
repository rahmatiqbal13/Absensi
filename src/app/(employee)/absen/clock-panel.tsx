"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, QrCode, MapPin } from "lucide-react";
import { OPTS as GEO_OPTS } from "@/lib/geo/use-geolocation";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import type { AttendanceStatus } from "@/lib/attendance/status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProximityPanel, type BranchGeofence } from "./proximity-panel";
import { QrScanner } from "./qr-scanner";
import { PhotoCaptureButton } from "./photo-capture-button";
import { formatClockTime } from "./today-timeline";
import { ShiftRibbon } from "./shift-ribbon";
import { HoldButton } from "./hold-button";
import { jakartaClock, useNow } from "@/lib/time/use-now";

export type TodaysAttendance = {
  jamMasuk: string;
  jamPulang: string | null;
  status: AttendanceStatus;
} | null;

export type WorkShift = { jamMasuk: string; jamPulang?: string; toleransiMenit: number } | null;

type ActionResult = { ok: true; status: AttendanceStatus } | { ok: false; error: string };

type GeoSummary = {
  status: "prompt" | "watching" | "granted" | "denied" | "unavailable";
  configured: boolean;
  withinRadius: boolean;
  hasFix: boolean;
};

/** Time from `startIso` to `endIso` (or now) as "3j 20m" (hours dropped when 0, e.g. "12m"). */
function computeDuration(startIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const totalMinutes = Math.max(0, Math.floor((end - new Date(startIso).getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m`;
}

// Server message for an out-of-radius rejection — kept in sync with
// clock-in.ts / clock-out.ts. When the server rejects for this reason the user
// must be shown the reason field even if the client geo fix looks in-radius.
const OUT_OF_RADIUS_MESSAGE = "Anda berada di luar radius kantor. Wajib isi catatan/alasan.";

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTS);
  });
}

export function ClockPanel({
  todaysAttendance,
  office,
  shift,
  qrEnabled,
  firstName,
  submitClockIn,
  submitClockOut,
}: {
  todaysAttendance: TodaysAttendance;
  firstName?: string;
  office: BranchGeofence;
  shift: WorkShift;
  qrEnabled: boolean;
  submitClockIn: (formData: FormData) => Promise<ActionResult>;
  submitClockOut: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Errors render in a role="alert" Alert; success has no visible message (the
  // panel just advances), so it is announced through this polite live region.
  const [announcement, setAnnouncement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"qr" | "gps">(qrEnabled ? "qr" : "gps");
  const [qrPayload, setQrPayload] = useState<string | null>(null);
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

  const scanning = qrEnabled && method === "qr";

  const reasonRequired =
    !scanning &&
    ((geo.configured && geo.hasFix && !geo.withinRadius) ||
      geo.status === "denied" ||
      geo.status === "unavailable" ||
      error === OUT_OF_RADIUS_MESSAGE);

  const reasonHelp =
    geo.status === "denied" || geo.status === "unavailable"
      ? "Lokasi tidak terbaca. Isi alasan untuk tetap absen."
      : "Anda terdeteksi di luar radius kantor. Jelaskan alasannya.";

  const submitDisabled =
    submitting ||
    !photo ||
    (scanning ? !qrPayload : reasonRequired && !reason.trim());
  const disabledHint = !photo
    ? "Ambil foto selfie dulu."
    : scanning && !qrPayload
      ? "Scan QR di layar kantor dulu."
      : reasonRequired && !reason.trim()
        ? "Isi alasan dulu."
        : null;

  async function handleClock(kind: "masuk" | "pulang") {
    // Capture before clearing: on a resubmit after a server out-of-radius
    // rejection the reason field is still required even though `error` is about
    // to be reset and the client geo fix may read in-radius.
    const sendReason = reasonRequired;
    setError(null);
    setAnnouncement("");
    setSubmitting(true);
    try {
      const formData = new FormData();
      if (scanning && qrPayload) {
        formData.set("qrToken", qrPayload);
        // Best effort — a coarse fix is still worth recording, but never block
        // the QR path on it.
        try {
          const position = await getPosition();
          formData.set("lat", String(position.coords.latitude));
          formData.set("long", String(position.coords.longitude));
        } catch {
          /* GPS is optional on the QR path */
        }
      } else {
        const position = await getPosition();
        formData.set("lat", String(position.coords.latitude));
        formData.set("long", String(position.coords.longitude));
      }
      if (photo) formData.set("photo", photo);
      const catatan = reason.trim();
      if (catatan && sendReason) formData.set("catatan", catatan);

      const action = kind === "masuk" ? submitClockIn : submitClockOut;
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        // The server rejected a QR submit for out-of-radius (QR was disabled
        // server-side mid-session). Flip to the GPS tab so the reason textarea —
        // which only renders off the QR method — becomes reachable.
        if (result.error === OUT_OF_RADIUS_MESSAGE) setMethod("gps");
      } else {
        setPhoto(null);
        setReason("");
        setQrPayload(null);
        setAnnouncement(kind === "masuk" ? "Absen masuk berhasil." : "Absen pulang berhasil.");
        // Re-fetch the server tree so the panel advances to the next state
        // (clocked-in / done) immediately, alongside the action's revalidatePath.
        router.refresh();
      }
    } catch {
      setError("Gagal mengambil lokasi. Pastikan GPS aktif dan izin lokasi diberikan.");
    } finally {
      setSubmitting(false);
    }
  }

  const shiftLine = shift ? (
    <ShiftRibbon
      jamMasuk={shift.jamMasuk}
      jamPulang={shift.jamPulang ?? null}
      toleransiMenit={shift.toleransiMenit}
      clockIn={todaysAttendance?.jamMasuk ?? null}
      clockOut={todaysAttendance?.jamPulang ?? null}
    />
  ) : null;

  // Kept as the first child of both return branches so React reuses the same
  // node across the clocked-in -> done transition; a freshly mounted live
  // region is not reliably announced.
  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  const summary = (
    <dl className="grid grid-cols-3 border-t border-border pt-3.5">
      {[
        { label: "Masuk", value: formatClockTime(todaysAttendance?.jamMasuk ?? null) },
        { label: "Pulang", value: formatClockTime(todaysAttendance?.jamPulang ?? null) },
        {
          label: "Durasi",
          value: todaysAttendance?.jamMasuk
            ? computeDuration(todaysAttendance.jamMasuk, todaysAttendance.jamPulang)
            : "—",
        },
      ].map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );

  if (done && todaysAttendance) {
    return (
      <div className="flex flex-col gap-5">
        {liveRegion}
        <BigClock />
        {shiftLine}
        <section className="flex flex-col gap-3.5 rounded-[20px] bg-primary p-5.5 text-primary-foreground">
          <span className="font-mono text-xs tracking-[0.08em] text-success-solid uppercase">
            Absensi hari ini selesai.
          </span>
          <p className="text-[1.6rem] leading-tight font-semibold tracking-[-0.02em]">
            Terima kasih{firstName ? `, ${firstName}` : ""}. Sampai besok.
          </p>
          <AttendanceStatusBadge status={todaysAttendance.status} />
        </section>
        {summary}
      </div>
    );
  }

  const label = clockedIn ? "Absen Pulang" : "Absen Masuk";

  return (
    <div className="flex flex-col gap-5">
      {liveRegion}
      <BigClock />
      {shiftLine}

      {clockedIn && todaysAttendance && (
        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-3.5">
          <AttendanceStatusBadge status={todaysAttendance.status} />
          <p className="font-mono text-[0.8rem] text-foreground">
            {formatClockTime(todaysAttendance.jamMasuk)} · sudah{" "}
            {computeDuration(todaysAttendance.jamMasuk, null)}
          </p>
        </div>
      )}

      {qrEnabled && (
        <Tabs
          value={method}
          onValueChange={(value) => {
            setMethod(value === "qr" ? "qr" : "gps");
            // Drop any decoded payload so a stale QR can't be submitted from
            // the other tab.
            setQrPayload(null);
          }}
        >
          <TabsList className="h-12 w-full rounded-xl bg-secondary p-1">
            <TabsTrigger value="qr" className="h-10 rounded-[9px] font-semibold data-active:bg-card">
              <QrCode aria-hidden="true" /> Scan QR
            </TabsTrigger>
            <TabsTrigger value="gps" className="h-10 rounded-[9px] font-semibold data-active:bg-card">
              <MapPin aria-hidden="true" /> Lokasi GPS
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {scanning ? (
        <div className="flex flex-col items-center gap-3 rounded-[20px] bg-primary p-5 text-primary-foreground">
          <QrScanner onDecode={setQrPayload} onReset={() => setQrPayload(null)} />
          {qrPayload && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-success-solid">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Lokasi terverifikasi via QR
            </p>
          )}
        </div>
      ) : (
        <ProximityPanel office={office} onGeoChange={onGeoChange} />
      )}

      <PhotoCaptureButton disabled={submitting} photo={photo} onPhotoChange={setPhoto} />

      {reasonRequired && (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 flex flex-col gap-1.5">
          <label htmlFor="clock-reason" className="text-[0.8rem] font-semibold text-foreground">
            Alasan
          </label>
          <Textarea
            id="clock-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: kunjungan klien di Kuningan"
            className="min-h-24"
          />
          <p className="text-sm text-muted-foreground">{reasonHelp} Atasan Anda akan melihat catatan ini.</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <HoldButton
          label={label}
          disabled={submitDisabled}
          busy={submitting}
          onConfirm={() => handleClock(clockedIn ? "pulang" : "masuk")}
        />
        <p className="text-sm text-muted-foreground">{disabledHint ?? "Tahan 1 detik sampai penuh."}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {summary}
    </div>
  );
}

function BigClock() {
  const now = useNow();
  const c = now ? jakartaClock(now) : null;
  return (
    <p className="flex items-baseline gap-1.5" aria-label={c ? `Pukul ${c.hm} WIB` : undefined}>
      <span className="text-[5.25rem] leading-[0.9] font-semibold tracking-[-0.05em] tabular-nums">
        {c?.hm ?? "--:--"}
      </span>
      <span className="font-mono text-xl text-muted-foreground tabular-nums" aria-hidden="true">
        {c?.s ?? "--"}
      </span>
    </p>
  );
}
