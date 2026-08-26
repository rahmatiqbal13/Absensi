"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { isMobileUserAgent } from "@/lib/attendance/mobile-detect";
import { clockIn, type ClockInResult } from "@/lib/attendance/clock-in";
import { clockOut, type ClockOutResult } from "@/lib/attendance/clock-out";
import { uploadAttendancePhoto } from "@/lib/attendance/photo-upload";

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

  return { ok: true as const, employee };
}

export async function submitClockIn(formData: FormData): Promise<ClockInResult> {
  const guard = await requireMobileEmployee();
  if (!guard.ok) return guard;

  const lat = Number(formData.get("lat"));
  const long = Number(formData.get("long"));
  const catatan = (formData.get("catatan") as string | null) ?? undefined;
  const photo = formData.get("photo") as Blob | null;
  if (!photo) {
    return { ok: false, error: "Foto selfie diperlukan." };
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
  const photo = formData.get("photo") as Blob | null;
  if (!photo) {
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
