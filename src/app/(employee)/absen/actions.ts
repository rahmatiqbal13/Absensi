"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { isMobileUserAgent } from "@/lib/attendance/mobile-detect";
import { clockIn, type ClockInResult } from "@/lib/attendance/clock-in";
import { clockOut, type ClockOutResult } from "@/lib/attendance/clock-out";
import { uploadAttendancePhoto } from "@/lib/attendance/photo-upload";
import { hasActiveConsent } from "@/lib/consent/consent";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function isValidCoordinate(lat: number, long: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(long) &&
    lat >= -90 &&
    lat <= 90 &&
    long >= -180 &&
    long <= 180
  );
}

function isValidPhoto(photo: FormDataEntryValue | null): photo is File {
  if (!(photo instanceof Blob)) return false;
  if (photo.size === 0 || photo.size > MAX_PHOTO_BYTES) return false;
  if (photo.type && !photo.type.startsWith("image/")) return false;
  return true;
}

async function requireMobileEmployee() {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent");
  if (!isMobileUserAgent(userAgent)) {
    return { ok: false as const, error: "Absen hanya bisa dilakukan dari HP." };
  }

  const authedDb = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(authedDb);
  if (!employee) {
    return { ok: false as const, error: "Anda belum masuk. Silakan login ulang." };
  }

  return { ok: true as const, employee, authedDb };
}

export async function submitClockIn(formData: FormData): Promise<ClockInResult> {
  const guard = await requireMobileEmployee();
  if (!guard.ok) return guard;

  const lat = Number(formData.get("lat"));
  const long = Number(formData.get("long"));
  if (!isValidCoordinate(lat, long)) {
    return { ok: false, error: "Lokasi tidak valid." };
  }
  const catatan = (formData.get("catatan") as string | null) ?? undefined;
  const photo = formData.get("photo");
  if (!isValidPhoto(photo)) {
    return { ok: false, error: "Foto selfie diperlukan." };
  }

  // Consent must be verified BEFORE the selfie is written to storage. clockIn()
  // checks this too (defense in depth), but by the time it runs the photo is
  // already in the bucket — and because the retention marker
  // (foto_masuk_expires_at) lives only on the attendances row that a rejected
  // clock-in never creates, such a photo is an orphan no retention job can ever
  // find. Checking here keeps the biometric data out of storage entirely when
  // the employee has not consented to its processing.
  const consented = await hasActiveConsent(guard.authedDb, guard.employee.id);
  if (!consented) {
    return {
      ok: false,
      error: "Persetujuan pemrosesan data lokasi/foto diperlukan sebelum absen.",
    };
  }

  const serviceDb = createServiceRoleSupabaseClient();

  const uploadResult = await uploadAttendancePhoto(serviceDb, guard.employee.id, photo, "masuk");
  if (!uploadResult.ok) {
    return { ok: false, error: uploadResult.error };
  }

  return clockIn(serviceDb, {
    employeeId: guard.employee.id,
    lat,
    long,
    photoPath: uploadResult.path,
    photoExpiresAt: uploadResult.expiresAt,
    catatan,
  });
}

export async function submitClockOut(formData: FormData): Promise<ClockOutResult> {
  const guard = await requireMobileEmployee();
  if (!guard.ok) return guard;

  const lat = Number(formData.get("lat"));
  const long = Number(formData.get("long"));
  if (!isValidCoordinate(lat, long)) {
    return { ok: false, error: "Lokasi tidak valid." };
  }
  const photo = formData.get("photo");
  if (!isValidPhoto(photo)) {
    return { ok: false, error: "Foto selfie diperlukan." };
  }

  const serviceDb = createServiceRoleSupabaseClient();

  const uploadResult = await uploadAttendancePhoto(serviceDb, guard.employee.id, photo, "pulang");
  if (!uploadResult.ok) {
    return { ok: false, error: uploadResult.error };
  }

  return clockOut(serviceDb, {
    employeeId: guard.employee.id,
    lat,
    long,
    photoPath: uploadResult.path,
    photoExpiresAt: uploadResult.expiresAt,
  });
}
