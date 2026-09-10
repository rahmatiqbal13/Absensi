"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The kiosk QR payload is "<branchId uuid>|<16 lowercase hex token>". Anything
// else the camera happens to see is ignored.
const PAYLOAD_RE = /^[0-9a-f-]{36}\|[0-9a-f]{16}$/;
const SCAN_INTERVAL_MS = 250;

type Phase = "idle" | "starting" | "scanning" | "denied" | "done";

export function QrScanner({
  onDecode,
  onReset,
  className,
}: {
  onDecode: (payload: string) => void;
  onReset?: () => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(true);

  const stopCamera = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Release the camera on unmount.
  useEffect(() => stopCamera, [stopCamera]);

  // Track mount state so a getUserMedia promise that resolves after unmount
  // stops the stream instead of leaking the camera.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(frame.data, frame.width, frame.height);
    if (result && PAYLOAD_RE.test(result.data)) {
      stopCamera();
      setPhase("done");
      onDecode(result.data);
    }
  }, [onDecode, stopCamera]);

  const start = useCallback(async () => {
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("scanning");
      intervalRef.current = setInterval(scanFrame, SCAN_INTERVAL_MS);
    } catch {
      setPhase("denied");
    }
  }, [scanFrame]);

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      {phase === "idle" && (
        <Button type="button" size="lg" variant="secondary" onClick={start} className="w-full">
          <Camera className="size-5" aria-hidden="true" /> Buka kamera
        </Button>
      )}

      {phase === "starting" && <p className="text-sm text-muted-foreground">Membuka kamera…</p>}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-label="Kamera pemindai QR"
        className={cn(
          "aspect-square w-full max-w-xs rounded-xl border border-border object-cover",
          phase === "scanning" ? "block" : "hidden",
        )}
      />

      {phase === "scanning" && (
        <p className="text-sm text-muted-foreground">Arahkan ke QR di layar kantor.</p>
      )}

      {phase === "denied" && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-destructive">Izin kamera ditolak — pakai Lokasi GPS.</p>
          <Button type="button" size="sm" variant="secondary" onClick={start}>
            <Camera className="size-4" aria-hidden="true" /> Coba lagi
          </Button>
        </div>
      )}

      {phase === "done" && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-500">
          <CheckCircle2 className="size-4" aria-hidden="true" /> QR terbaca.
          <button
            type="button"
            className="ml-1 underline"
            onClick={() => {
              onReset?.();
              setPhase("idle");
            }}
          >
            Scan ulang
          </button>
        </p>
      )}
    </div>
  );
}
