"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronUp, MapPin, MapPinned, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldSection } from "@/components/field-section";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { walkingMinutes } from "@/lib/geo/format-distance";
import { cn } from "@/lib/utils";
import { BranchQrSection } from "./branch-qr-section";
import { LocationEditor } from "./location-editor";

export type BranchLocation = {
  id: string;
  nama: string;
  alamat: string | null;
  lat: number;
  long: number;
  radius: number;
};

export type DepartmentLocation = {
  id: string;
  nama: string;
  /** null = follows the branch pin */
  pin: { lat: number; long: number; radius: number } | null;
};

type Result = { ok: true } | { ok: false; error: string };

export function LocationForm({
  branch,
  fallbackCenter,
  saveBranchLocation,
  qrEnabled,
  kioskUrl,
  setBranchQr,
  resetKioskKey,
  departments = [],
  saveDepartmentLocation,
  clearDepartmentLocation,
}: {
  branch: BranchLocation;
  fallbackCenter: { lat: number; lng: number };
  saveBranchLocation: (branchId: string, fd: FormData) => Promise<Result>;
  qrEnabled: boolean;
  kioskUrl: string | null;
  setBranchQr: (branchId: string, fd: FormData) => Promise<Result>;
  resetKioskKey: (branchId: string) => Promise<Result>;
  departments?: DepartmentLocation[];
  saveDepartmentLocation?: (departmentId: string, fd: FormData) => Promise<Result>;
  clearDepartmentLocation?: (departmentId: string) => Promise<Result>;
}) {
  const [saved, setSaved] = useState({
    configured: !(branch.lat === 0 && branch.long === 0),
    lat: branch.lat,
    lng: branch.long,
    radius: branch.radius || 100,
  });
  const [open, setOpen] = useState<string | null>(null);
  const branchPoint = saved.configured ? { lat: saved.lat, lng: saved.lng } : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{branch.nama}</CardTitle>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              saved.configured ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground",
            )}
          >
            {saved.configured ? `Aktif · ${saved.radius} m · ${walkingMinutes(saved.radius)}` : "Belum diatur"}
          </span>
        </div>
        {branch.alamat && <p className="text-sm text-muted-foreground">{branch.alamat}</p>}
      </CardHeader>
      <CardContent className="space-y-6">
        <FieldSection icon={MapPin} title="Titik & Radius">
          <LocationEditor
            initialPoint={branchPoint}
            fallbackCenter={fallbackCenter}
            initialRadius={saved.radius}
            save={(fd) => saveBranchLocation(branch.id, fd)}
            successMessage="Lokasi kantor tersimpan."
            onSaved={(v) => setSaved({ configured: true, lat: v.lat, lng: v.lng, radius: v.radius })}
          />
        </FieldSection>

        {saveDepartmentLocation && clearDepartmentLocation && (
          <FieldSection icon={Building2} title="Titik per departemen">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Atur titik khusus bila sebuah departemen bekerja di lokasi lain (gedung, gudang, atau proyek).
                Departemen tanpa titik khusus memakai titik cabang di atas.
              </p>
              {departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada departemen di cabang ini.{" "}
                  <Link href="/pengaturan/departemen" className="font-semibold text-brand-text underline-offset-4 hover:underline">
                    Tambah departemen
                  </Link>
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {departments.map((d) => {
                    const expanded = open === d.id;
                    return (
                      <li key={d.id} className="rounded-xl bg-background p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="font-semibold text-foreground">{d.nama}</span>
                            <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              {d.pin ? (
                                <>
                                  <Badge variant="info">Titik khusus</Badge>
                                  <span className="font-mono">
                                    {d.pin.lat.toFixed(5)}, {d.pin.long.toFixed(5)} · {d.pin.radius} m
                                  </span>
                                </>
                              ) : (
                                <Badge variant="neutral">Ikut titik cabang</Badge>
                              )}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-expanded={expanded}
                            aria-controls={`dept-loc-${d.id}`}
                            onClick={() => setOpen(expanded ? null : d.id)}
                          >
                            {expanded ? <ChevronUp /> : <MapPinned />}
                            {expanded ? "Tutup" : d.pin ? "Ubah titik" : "Atur titik khusus"}
                          </Button>
                        </div>
                        {expanded && (
                          <div id={`dept-loc-${d.id}`} className="mt-4">
                            <LocationEditor
                              // A new department pin starts from the branch's.
                              initialPoint={d.pin ? { lat: d.pin.lat, lng: d.pin.long } : branchPoint}
                              fallbackCenter={fallbackCenter}
                              initialRadius={d.pin?.radius ?? saved.radius}
                              alwaysDirty={!d.pin}
                              save={(fd) => saveDepartmentLocation(d.id, fd)}
                              successMessage={`Titik ${d.nama} tersimpan.`}
                              submitLabel={`Simpan titik ${d.nama}`}
                              extraActions={
                                d.pin ? (
                                  <ConfirmDeleteButton
                                    action={() => clearDepartmentLocation(d.id)}
                                    title={`Hapus titik khusus ${d.nama}?`}
                                    description="Karyawan di departemen ini akan kembali absen di titik cabang."
                                    label="Ikuti titik cabang"
                                    confirmLabel="Hapus titik khusus"
                                  />
                                ) : null
                              }
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </FieldSection>
        )}

        <FieldSection icon={QrCode} title="Absen QR">
          <BranchQrSection
            branchId={branch.id}
            qrEnabled={qrEnabled}
            kioskUrl={kioskUrl}
            setBranchQr={setBranchQr}
            resetKioskKey={resetKioskKey}
          />
        </FieldSection>
      </CardContent>
    </Card>
  );
}
