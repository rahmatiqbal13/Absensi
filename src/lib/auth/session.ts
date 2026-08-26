import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./route-access";

export type CurrentEmployee = {
  id: string;
  nama: string;
  email: string;
  role: Role;
  branchId: string;
};

export async function getCurrentEmployee(
  db: SupabaseClient,
): Promise<CurrentEmployee | null> {
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) return null;

  const { data: employee } = await db
    .from("employees")
    .select("id, nama, email, role, branch_id")
    .eq("id", userData.user.id)
    .single();
  if (!employee) return null;

  return {
    id: employee.id,
    nama: employee.nama,
    email: employee.email,
    role: employee.role,
    branchId: employee.branch_id,
  };
}
