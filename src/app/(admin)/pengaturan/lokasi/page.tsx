import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LocationForm, type BranchLocation } from "./location-form";
import { saveBranchLocation, setBranchQr, resetKioskKey } from "./actions";

const JAKARTA = { lat: -6.2, lng: 106.816 };

export default async function LokasiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  // Migration 0031 (qr_enabled, kiosk_key) may not be applied yet: if selecting
  // those columns errors, retry without them and treat QR as off per branch.
  type BranchRow = {
    id: string;
    nama: string;
    alamat: string | null;
    lat: number;
    long: number;
    radius_geofencing_meter: number;
    qr_enabled?: boolean | null;
    kiosk_key?: string | null;
  };
  let branches: BranchRow[] | null = null;
  const full = await db
    .from("branches")
    .select("id, nama, alamat, lat, long, radius_geofencing_meter, qr_enabled, kiosk_key")
    .order("nama");
  if (full.error) {
    console.error("lokasi: branches query failed (retrying without QR columns)", full.error);
    const basic = await db
      .from("branches")
      .select("id, nama, alamat, lat, long, radius_geofencing_meter")
      .order("nama");
    if (basic.error) console.error("lokasi: branches query failed", basic.error);
    branches = basic.data;
  } else {
    branches = full.data;
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  const origin = host ? `${proto}://${host}` : "";

  const rows: (BranchLocation & { qrEnabled: boolean; kioskUrl: string | null })[] =
    (branches ?? []).map((b) => ({
      id: b.id,
      nama: b.nama,
      alamat: b.alamat,
      lat: b.lat,
      long: b.long,
      radius: b.radius_geofencing_meter,
      qrEnabled: b.qr_enabled ?? false,
      kioskUrl: b.kiosk_key && origin ? `${origin}/kiosk/${b.kiosk_key}` : null,
    }));

  const configuredBranch = rows.find((r) => !(r.lat === 0 && r.long === 0));
  const fallbackCenter = configuredBranch
    ? { lat: configuredBranch.lat, lng: configuredBranch.long }
    : JAKARTA;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lokasi Kantor"
        description="Titik kantor dan radius geofence dipakai untuk memvalidasi absensi karyawan."
      />
      {rows.length === 0 ? (
        <EmptyState icon={MapPin} message="Belum ada cabang. Tambahkan lewat menu Cabang." />
      ) : (
        <div className="space-y-4">
          {rows.map((b) => (
            <LocationForm
              key={b.id}
              branch={b}
              fallbackCenter={fallbackCenter}
              saveBranchLocation={saveBranchLocation}
              qrEnabled={b.qrEnabled}
              kioskUrl={b.kioskUrl}
              setBranchQr={setBranchQr}
              resetKioskKey={resetKioskKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
