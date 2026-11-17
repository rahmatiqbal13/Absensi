import type { SupabaseClient } from "@supabase/supabase-js";

/** The geofence an employee clocks in against. */
export type OfficeLocation = {
  lat: number;
  long: number;
  radius_geofencing_meter: number;
  /** Where the pin came from: the employee's department, or their branch. */
  sumber: "departemen" | "cabang";
};

type BranchPin = { lat: number; long: number; radius_geofencing_meter: number };
type DepartmentPin = {
  lat: number | null;
  long: number | null;
  radius_geofencing_meter: number | null;
  branch_id?: string | null;
};

/** Department pin when it has one (and belongs to the branch), else the branch pin. */
export function pickOfficeLocation(
  branch: BranchPin,
  department: DepartmentPin | null | undefined,
  branchId?: string,
): OfficeLocation {
  const sameBranch = !branchId || !department?.branch_id || department.branch_id === branchId;
  if (department && sameBranch && department.lat != null && department.long != null) {
    return {
      lat: department.lat,
      long: department.long,
      radius_geofencing_meter: department.radius_geofencing_meter ?? branch.radius_geofencing_meter,
      sumber: "departemen",
    };
  }
  return { ...pickBranch(branch), sumber: "cabang" };
}

function pickBranch(b: BranchPin): BranchPin {
  return { lat: b.lat, long: b.long, radius_geofencing_meter: b.radius_geofencing_meter };
}

/**
 * Resolves the employee's geofence. Migration-tolerant: before 0037 the
 * department columns don't exist, and any lookup failure falls back to the
 * branch pin — the same geofence everyone used before department pins existed.
 */
export async function loadOfficeLocation(
  db: SupabaseClient,
  branch: BranchPin,
  branchId: string,
  departmentId: string | null | undefined,
): Promise<OfficeLocation> {
  if (!departmentId) return pickOfficeLocation(branch, null);
  const { data, error } = await db
    .from("departments")
    .select("lat, long, radius_geofencing_meter, branch_id")
    .eq("id", departmentId)
    .maybeSingle();
  if (error) {
    console.error("loadOfficeLocation: department pin lookup failed (using branch pin)", error);
    return pickOfficeLocation(branch, null);
  }
  return pickOfficeLocation(branch, data as DepartmentPin | null, branchId);
}
