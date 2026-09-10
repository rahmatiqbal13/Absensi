"use client";

import { useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";

type Result = { ok: true } | { ok: false; error: string };

export function BranchQrSection({
  branchId,
  qrEnabled,
  kioskUrl,
  setBranchQr,
  resetKioskKey,
}: {
  branchId: string;
  qrEnabled: boolean;
  kioskUrl: string | null;
  setBranchQr: (branchId: string, fd: FormData) => Promise<Result>;
  resetKioskKey: (branchId: string) => Promise<Result>;
}) {
  const [busy, setBusy] = useState(false);
  const checkboxRef = useRef<HTMLInputElement | null>(null);

  // On any failure, snap the checkbox back to the server's known state so the UI
  // never claims a setting that did not persist.
  function revertCheckbox() {
    if (checkboxRef.current) checkboxRef.current.checked = qrEnabled;
  }

  async function toggleAction(fd: FormData) {
    const enabled = fd.get("enabled");
    setBusy(true);
    try {
      const r = await setBranchQr(branchId, fd);
      if (!r.ok) {
        revertCheckbox();
        toast.error(r.error);
        return;
      }
      toast.success(enabled ? "Absen QR diaktifkan." : "Absen QR dimatikan.");
    } catch (e) {
      console.error(e);
      revertCheckbox();
      toast.error("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!kioskUrl || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(kioskUrl);
      toast.success("Link disalin.");
    } catch (e) {
      console.error(e);
      toast.error("Gagal menyalin link.");
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const r = await resetKioskKey(branchId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Link kiosk & kode QR baru dibuat. Perbarui layar kiosk.");
    } catch (e) {
      console.error(e);
      toast.error("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form action={toggleAction}>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            ref={checkboxRef}
            type="checkbox"
            name="enabled"
            defaultChecked={qrEnabled}
            disabled={busy}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="size-4 accent-primary"
          />
          Aktifkan Absen QR
        </label>
      </form>

      {qrEnabled && kioskUrl && (
        <div className="space-y-2">
          <code className="block overflow-x-auto rounded-md border border-border bg-muted px-2 py-1 text-xs">
            {kioskUrl}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={copyLink}
            >
              Salin link
            </Button>
            <a
              href={kioskUrl}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Buka kiosk
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={regenerate}
            >
              Ganti link & kode QR
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {"Tampilkan link ini di layar dekat pintu kantor. Kode berganti tiap 30 detik. Karyawan pilih 'Scan QR' di halaman Absen."}
          </p>
        </div>
      )}
    </div>
  );
}
