"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resizeToSquareJpeg } from "@/lib/profile/image";

type Result = { ok: true } | { ok: false; error: string };

function initials(nama: string): string {
  return (
    nama
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ProfilForm({
  defaultPhone,
  nama,
  photoUrl,
  updatePhone,
  uploadPhoto,
  removePhoto,
}: {
  defaultPhone: string;
  nama: string;
  photoUrl: string | null;
  updatePhone: (fd: FormData) => Promise<Result>;
  uploadPhoto: (fd: FormData) => Promise<Result>;
  removePhoto: () => Promise<Result>;
}) {
  const [phone, setPhone] = useState(defaultPhone);
  const [pendingPhone, startPhone] = useTransition();
  const [pendingPhoto, startPhoto] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const pendingBlob = useRef<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function savePhone() {
    startPhone(async () => {
      const fd = new FormData();
      fd.set("no_telp", phone);
      const r = await updatePhone(fd);
      if (r.ok) toast.success("Nomor telepon tersimpan.");
      else toast.error(r.error);
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await resizeToSquareJpeg(file);
      pendingBlob.current = blob;
      const url =
        typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : "";
      setPreview(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses foto.");
    }
  }

  function cancelPreview() {
    if (preview && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(preview);
    setPreview(null);
    pendingBlob.current = null;
  }

  function confirmUpload() {
    const blob = pendingBlob.current;
    if (!blob) return;
    startPhoto(async () => {
      const fd = new FormData();
      fd.set("photo", blob);
      const r = await uploadPhoto(fd);
      if (r.ok) {
        toast.success("Foto profil diperbarui.");
        cancelPreview();
      } else {
        toast.error(r.error);
      }
    });
  }

  function onRemove() {
    startPhoto(async () => {
      const r = await removePhoto();
      if (r.ok) toast.success("Foto profil dihapus.");
      else toast.error(r.error);
    });
  }

  const shown = preview ?? photoUrl;

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {shown ? <AvatarImage src={shown} alt="" /> : null}
          <AvatarFallback>{initials(nama)}</AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Pilih berkas foto"
            className="hidden"
            onChange={onFile}
          />
          {!preview && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                Ganti Foto
              </Button>
              {photoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pendingPhoto}
                  onClick={onRemove}
                >
                  Hapus Foto
                </Button>
              )}
            </div>
          )}
          {preview && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={pendingPhoto} onClick={confirmUpload}>
                {pendingPhoto ? "Mengunggah…" : "Unggah"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelPreview}>
                Batal
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">JPG/PNG/WEBP — otomatis dipotong persegi.</p>
        </div>
      </div>

      <form
        action={(fd) => {
          setPhone(String(fd.get("no_telp") ?? ""));
          savePhone();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Field id="no_telp" label="Nomor Telepon" className="flex-1">
          <Input
            name="no_telp"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 text-base"
          />
        </Field>
        <Button type="submit" disabled={pendingPhone} className="h-11">
          {pendingPhone ? "Menyimpan…" : "Simpan"}
        </Button>
      </form>
    </div>
  );
}
