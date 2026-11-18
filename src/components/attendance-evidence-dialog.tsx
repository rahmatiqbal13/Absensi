"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Camera, ImageOff, MapPin, QrCode, ScanFace, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistance } from "@/lib/geo/format-distance";
import { LOCATION_FLAG_LABELS } from "@/lib/attendance/location-flags";
import type { AttendanceEvidence, EvidenceResult, EvidenceSide } from "@/lib/attendance/evidence";
import type { MapPoint } from "@/components/location-map";

const LocationMap = dynamic(() => import("@/components/location-map").then((m) => m.LocationMap), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
});

// Distinct from the blue office pin: green = masuk, orange = pulang.
const MASUK_COLOR = "#16a34a";
const PULANG_COLOR = "#ea580c";

const JAM = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/**
 * HR-only: the selfies and positions behind one attendance day. Loads on open
 * (each open is audit-logged server-side); photo links expire after 5 minutes,
 * so reopening fetches fresh ones.
 */
export function AttendanceEvidenceDialog({
  tanggalLabel,
  load,
}: {
  tanggalLabel: string;
  load: () => Promise<EvidenceResult>;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<EvidenceResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResult(null);
      startTransition(async () => setResult(await load()));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="min-h-9 gap-1.5 px-2 text-brand-text">
          <ScanFace className="size-4" aria-hidden="true" /> Detail
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Foto &amp; lokasi absen</DialogTitle>
          <DialogDescription>
            {tanggalLabel}. Foto wajah adalah data pribadi; setiap pembukaan tercatat di audit log.
          </DialogDescription>
        </DialogHeader>
        {pending || !result ? (
          <div className="grid gap-4">
            <Skeleton className="h-64 w-full rounded-lg" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="aspect-[3/4] w-full rounded-lg" />
              <Skeleton className="aspect-[3/4] w-full rounded-lg" />
            </div>
          </div>
        ) : result.ok ? (
          <EvidenceBody e={result.evidence} />
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EvidenceBody({ e }: { e: AttendanceEvidence }) {
  const points: MapPoint[] = [
    e.masuk.lokasi && { ...e.masuk.lokasi, label: "Masuk", color: MASUK_COLOR },
    e.pulang.lokasi && { ...e.pulang.lokasi, label: "Pulang", color: PULANG_COLOR },
  ].filter((p): p is MapPoint => !!p);
  const center = e.kantor ? { lat: e.kantor.lat, lng: e.kantor.long } : points[0];

  return (
    <div className="grid gap-4">
      {center ? (
        <div className="grid gap-1.5">
          <LocationMap
            mode="view"
            center={center}
            marker={center}
            radiusMeters={e.kantor?.radius_geofencing_meter ?? 0}
            points={points}
            failedMessage="Peta tidak dapat dimuat. Koordinat tetap tercantum di bawah."
            className="h-64"
          />
          <p className="text-xs text-muted-foreground">
            {e.kantor
              ? `Pin biru = titik kantor (${e.kantor.sumber}), lingkaran = radius ${e.kantor.radius_geofencing_meter} m. Titik hijau = masuk, oranye = pulang.`
              : "Titik kantor belum diatur, jadi jarak tidak dihitung."}
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          Tidak ada koordinat untuk hari ini (absen lewat QR tanpa GPS).
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <SidePanel title="Masuk" color={MASUK_COLOR} s={e.masuk} radius={e.kantor?.radius_geofencing_meter} />
        <SidePanel title="Pulang" color={PULANG_COLOR} s={e.pulang} radius={e.kantor?.radius_geofencing_meter} />
      </div>

      {e.catatan && (
        <p className="text-sm">
          <span className="font-semibold">Catatan karyawan:</span>{" "}
          <span className="text-muted-foreground italic">“{e.catatan}”</span>
        </p>
      )}
    </div>
  );
}

function SidePanel({ title, color, s, radius }: { title: string; color: string; s: EvidenceSide; radius?: number }) {
  if (!s.jam) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">Belum ada absen {title.toLowerCase()}.</p>
      </section>
    );
  }
  const outside = s.jarakMeter != null && radius != null && s.jarakMeter > radius;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
          {title} · <span className="font-mono tabular-nums">{JAM.format(new Date(s.jam))}</span>
        </h3>
        {s.metode && (
          <Badge variant="neutral" className="gap-1">
            {s.metode === "qr" ? <QrCode className="size-3" aria-hidden="true" /> : <MapPin className="size-3" aria-hidden="true" />}
            {s.metode === "qr" ? "QR kiosk" : "GPS"}
          </Badge>
        )}
      </div>

      <Photo s={s} title={title} />

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Jarak dari kantor</dt>
        <dd className={outside ? "font-semibold text-warning-foreground" : ""}>
          {s.jarakMeter == null ? "—" : `${formatDistance(s.jarakMeter)}${outside ? " (di luar radius)" : ""}`}
        </dd>
        <dt className="text-muted-foreground">Akurasi GPS</dt>
        <dd>{s.akurasiMeter == null ? "—" : `± ${Math.round(s.akurasiMeter)} m`}</dd>
        <dt className="text-muted-foreground">Koordinat</dt>
        <dd className="font-mono text-xs tabular-nums">
          {s.lokasi ? (
            <a
              href={`https://www.openstreetmap.org/?mlat=${s.lokasi.lat}&mlon=${s.lokasi.lng}#map=18/${s.lokasi.lat}/${s.lokasi.lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-brand-text underline-offset-2 hover:underline"
            >
              {s.lokasi.lat.toFixed(6)}, {s.lokasi.lng.toFixed(6)}
            </a>
          ) : (
            "—"
          )}
        </dd>
      </dl>

      {s.flags.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-warning-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {s.flags.map((f) => LOCATION_FLAG_LABELS[f]).join("; ")}
        </p>
      )}
    </section>
  );
}

function Photo({ s, title }: { s: EvidenceSide; title: string }) {
  if (s.fotoUrl) {
    return (
      // Short-lived signed URL from private storage: next/image can't optimize it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={s.fotoUrl}
        alt={`Foto selfie absen ${title.toLowerCase()}`}
        className="aspect-[3/4] w-full rounded-lg bg-muted object-cover"
      />
    );
  }
  const text =
    s.fotoStatus === "dihapus"
      ? "Foto sudah dihapus otomatis (lebih dari 90 hari)."
      : s.fotoStatus === "gagal"
        ? "Foto tidak dapat dimuat. Tutup lalu buka lagi."
        : "Tidak ada foto.";
  const Icon = s.fotoStatus === "dihapus" ? ImageOff : Camera;
  return (
    <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
      <Icon className="size-6" aria-hidden="true" />
      {text}
    </div>
  );
}
