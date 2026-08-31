import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./route-access";

export type CurrentEmployee = {
  id: string;
  nama: string;
  email: string;
  role: Role;
  branchId: string;
  fotoPath: string | null;
};

// Wrapped in React `cache` so a single request de-dupes it repo-wide — `/profil`
// resolves it in both (account)/layout.tsx and profil/page.tsx. `cache` keys on
// the argument; `db` is a fresh client per request, so this de-dupes within a
// request only.
export const getCurrentEmployee = cache(async function getCurrentEmployee(
  db: SupabaseClient,
): Promise<CurrentEmployee | null> {
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) return null;

  const { data: employee, error } = await db
    .from("employees")
    .select("id, nama, email, role, branch_id, status, foto_profil_url")
    .eq("id", userData.user.id)
    .single();
  if (error) {
    console.error("getCurrentEmployee: employees query failed", error);
  }
  if (!employee || employee.status !== "aktif") return null;

  return {
    id: employee.id,
    nama: employee.nama,
    email: employee.email,
    role: employee.role,
    branchId: employee.branch_id,
    fotoPath: employee.foto_profil_url ?? null,
  };
});
