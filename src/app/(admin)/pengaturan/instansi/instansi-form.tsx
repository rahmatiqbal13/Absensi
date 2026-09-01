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
    } finally {
      setBusy(false);
    }
  }

  async function onLogo(formData: FormData) {
    setBusy(true);
    try {
      const r = await uploadLogo(formData);
      if (r.ok) toast.success("Logo diperbarui.");
      else toast.error(r.error);
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
                value={HEX_RE.test(hex) ? hex : "#2563EB"}
                onChange={(e) => setHex(e.target.value.toUpperCase())}
                className="mb-1 h-9 w-9 shrink-0 rounded border border-input"
              />
            </div>
            {warning && (
              <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
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
                <img src={defaults.logoUrl} alt="Logo saat ini" className="mb-2 h-16 w-16 rounded object-contain" />
              )}
              <form action={onLogo} className="space-y-2">
                <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
                <p className="text-xs text-muted-foreground">PNG/JPG/WEBP/SVG, maks 512 KB.</p>
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
