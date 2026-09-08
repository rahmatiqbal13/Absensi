import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LocationForm, type BranchLocation } from "./location-form";
import { saveBranchLocation } from "./actions";

const JAKARTA = { lat: -6.2, lng: 106.816 };

export default async function LokasiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error } = await db
    .from("branches")
    .select("id, nama, alamat, lat, long, radius_geofencing_meter")
    .order("nama");
  if (error) console.error("lokasi: branches query failed", error);

  const rows: BranchLocation[] = (branches ?? []).map((b) => ({
    id: b.id,
    nama: b.nama,
    alamat: b.alamat,
    lat: b.lat,
    long: b.long,
    radius: b.radius_geofencing_meter,
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
        <EmptyState icon={MapPin} message="Belum ada cabang." />
      ) : (
        <div className="space-y-4">
          {rows.map((b) => (
            <LocationForm
              key={b.id}
              branch={b}
              fallbackCenter={fallbackCenter}
              saveBranchLocation={saveBranchLocation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
