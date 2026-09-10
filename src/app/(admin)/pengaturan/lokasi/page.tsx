import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/server";
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

  type BranchRow = {
    id: string;
    nama: string;
    alamat: string | null;
    lat: number;
    long: number;
    radius_geofencing_meter: number;
  };
  const { data: branchesData, error: branchesErr } = await db
    .from("branches")
    .select("id, nama, alamat, lat, long, radius_geofencing_meter")
    .order("nama");
  if (branchesErr) console.error("lokasi: branches query failed", branchesErr);
  const branches: BranchRow[] | null = branchesData;

  // kiosk_key is a server-only secret and qr_secret is world-unreadable after
  // migration 0031's column grant — read the QR admin fields with the
  // service-role client (we are already behind the hr_admin/super_admin guard).
  // Separate query so a pre-migration project (no qr_enabled/kiosk_key columns)
  // still renders the location editor instead of erroring the whole page.
  const service = createServiceRoleSupabaseClient();
  const { data: qrRows, error: qrErr } = await service
    .from("branches")
    .select("id, qr_enabled, kiosk_key");
  if (qrErr) {
    console.error("lokasi: QR columns query failed (treating QR as off)", qrErr);
  }
  const qrById = new Map(
    (qrRows ?? []).map((r) => [
      r.id as string,
      { qrEnabled: (r.qr_enabled as boolean | null) ?? false, kioskKey: (r.kiosk_key as string | null) ?? null },
    ]),
  );

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  const origin = host ? `${proto}://${host}` : "";

  const rows: (BranchLocation & { qrEnabled: boolean; kioskUrl: string | null })[] =
    (branches ?? []).map((b) => {
      const qr = qrById.get(b.id);
      return {
        id: b.id,
        nama: b.nama,
        alamat: b.alamat,
        lat: b.lat,
        long: b.long,
        radius: b.radius_geofencing_meter,
        qrEnabled: qr?.qrEnabled ?? false,
        kioskUrl: qr?.kioskKey && origin ? `${origin}/kiosk/${qr.kioskKey}` : null,
      };
    });

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
