"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { accentWarning } from "@/lib/branding/accent";
import type { AppSettings } from "@/lib/branding/get-app-settings";
import { BrandPreview } from "./brand-preview";
import { prepareLogo } from "@/lib/branding/prepare-logo";

type Result = { ok: true } | { ok: false; error: string };

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function InstansiForm({
  defaults,
  saveAppSettings,
  uploadLogo,
  removeLogo,
}: {
  defaults: AppSettings;
  saveAppSettings: (fd: FormData) => Promise<Result>;
  uploadLogo: (fd: FormData) => Promise<Result>;
  removeLogo: () => Promise<Result>;
}) {
  const [hex, setHex] = useState(defaults.warnaAksen);
  const [namaSingkat, setNamaSingkat] = useState(defaults.namaSingkat);
  const [busy, setBusy] = useState(false);

  const hexInvalid = hex.length > 0 && !HEX_RE.test(hex);
  const warning = HEX_RE.test(hex) ? accentWarning(hex) : null;

  async function onSave(formData: FormData) {
    setBusy(true);
    try {
      const r = await saveAppSettings(formData);
      if (r.ok) toast.success("Pengaturan instansi tersimpan.");
      else toast.error(r.error);
    } catch (e) {
      console.error("saveAppSettings failed", e);
      toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogo(formData: FormData) {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Pilih berkas logo dulu, lalu klik Unggah Logo.");
      return;
    }
    setBusy(true);
    try {
      // Fit the 512 KB limit and convert WEBP/SVG to PNG (the PDFs can't read those).
      const prepared = await prepareLogo(file);
      if (!prepared.ok) {
        toast.error(prepared.error);
        return;
      }
      formData.set("logo", prepared.file);
      const r = await uploadLogo(formData);
      if (r.ok)
        toast.success(
          prepared.compressed
            ? `Logo diperbarui (dikompres dari ${Math.round(file.size / 1024)} KB ke ${Math.round(prepared.file.size / 1024)} KB).`
            : "Logo diperbarui.",
        );
      else toast.error(r.error);
    } catch (e) {
      // A request rejected before the action runs (e.g. an oversized file)
      // throws instead of returning a Result — never fail silently.
      console.error("uploadLogo failed", e);
      toast.error("Gagal mengunggah logo. Pastikan ukurannya maksimal 512 KB lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardContent>
          <form action={onSave} className="space-y-5">
            <Field id="nama_instansi" label="Nama Instansi" required>
              <Input name="nama_instansi" defaultValue={defaults.namaInstansi} />
            </Field>
            <Field id="nama_singkat" label="Nama Singkat" hint="Dipakai di sidebar & tempat sempit" required>
              <Input
                name="nama_singkat"
                value={namaSingkat}
                onChange={(e) => setNamaSingkat(e.target.value)}
              />
            </Field>
            <Field id="tagline" label="Tagline">
              <Input name="tagline" defaultValue={defaults.tagline ?? ""} />
            </Field>
            <Field id="alamat" label="Alamat">
              <Input name="alamat" defaultValue={defaults.alamat ?? ""} />
            </Field>
            <Field id="telepon" label="Telepon">
              <Input name="telepon" defaultValue={defaults.telepon ?? ""} />
            </Field>
            <Field id="email" label="Email">
              <Input name="email" type="email" defaultValue={defaults.email ?? ""} />
            </Field>
            <div className="flex items-end gap-2">
              <Field
                id="warna_aksen"
                label="Warna Aksen"
                error={hexInvalid ? "Format warna harus #RRGGBB." : undefined}
                className="flex-1"
              >
                <Input
                  name="warna_aksen"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="w-40 font-mono"
                />
              </Field>
              <input
                type="color"
                aria-label="Pemilih warna"
                value={HEX_RE.test(hex) ? hex : "#C63B22"}
                onChange={(e) => setHex(e.target.value.toUpperCase())}
                className="mb-1 h-9 w-9 shrink-0 rounded border border-input"
              />
            </div>
            {warning && (
              <p role="status" className="text-xs text-warning-foreground">
                {warning}
              </p>
            )}
            <Button type="submit" disabled={busy || hexInvalid}>
              Simpan
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <aside className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Pratinjau</p>
              <BrandPreview hex={HEX_RE.test(hex) ? hex : defaults.warnaAksen} namaSingkat={namaSingkat} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Logo</p>
              {defaults.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo from storage; a 64px preview needs no optimizer
                <img src={defaults.logoUrl} alt="Logo saat ini" className="mb-2 h-16 w-16 rounded object-contain" />
              )}
              <form action={onLogo} className="space-y-2">
                <Input
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={busy}
                  // Upload as soon as a file is picked: the logo is a separate
                  // form from "Simpan", and picking a file then pressing Simpan
                  // used to leave the logo silently unsaved.
                  onChange={(e) => {
                    if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  PNG/JPG/WEBP/SVG. Langsung terunggah setelah dipilih; logo besar otomatis dikompres ke maks
                  512 KB dan WEBP/SVG diubah ke PNG. Dipakai di header aplikasi, ikon tab browser, dan kop PDF
                  laporan &amp; slip gaji.
                </p>
                <div className="flex gap-2">
                  <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                    Unggah Logo
                  </Button>
                  {defaults.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const r = await removeLogo();
                          if (r.ok) toast.success("Logo dihapus.");
                          else toast.error(r.error);
                        } catch (e) {
                          console.error("removeLogo failed", e);
                          toast.error("Gagal menghapus logo. Coba lagi.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Hapus Logo
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </aside>
        </CardContent>
      </Card>
    </div>
  );
}
