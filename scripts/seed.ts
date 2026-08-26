import { config } from "dotenv";
import { createServiceRoleSupabaseClient } from "../src/lib/supabase/server";

// Load environment variables from .env.local when running directly
if (require.main === module) {
  config({ path: ".env.local" });
}

export async function runSeed() {
  const db = createServiceRoleSupabaseClient();

  // Get all "Kantor Pusat" branches, preferring those with existing super_admins
  let { data: allBranches } = await db
    .from("branches")
    .select("*")
    .eq("nama", "Kantor Pusat");

  let branch: any = null;

  // First, try to find a branch that already has 2 super_admins
  if (allBranches && allBranches.length > 0) {
    for (const b of allBranches) {
      const { data: admins } = await db
        .from("employees")
        .select("*")
        .eq("role", "super_admin")
        .eq("branch_id", b.id);
      if (admins && admins.length >= 2) {
        branch = b;
        break;
      }
    }
    // If no branch has admins yet, use the first one
    if (!branch) {
      branch = allBranches[0];
    }
  }

  if (!branch) {
    const { data: created } = await db
      .from("branches")
      .insert({ nama: "Kantor Pusat", alamat: "-", lat: -6.2, long: 106.816 })
      .select()
      .single();
    branch = created;

    await db.from("work_schedules").insert({
      branch_id: branch!.id,
      jam_masuk: "09:00",
      jam_pulang: "17:00",
      hari_kerja: [1, 2, 3, 4, 5],
      toleransi_terlambat_menit: 15,
    });
  }

  const { data: existingAdmins } = await db
    .from("employees")
    .select("*")
    .eq("role", "super_admin")
    .eq("branch_id", branch!.id);

  // If we already have 2 or more, we're done
  if (existingAdmins && existingAdmins.length >= 2) return;

  const adminSeeds = [
    { email: "superadmin1@absensi-hr.local", nama: "Super Admin Satu" },
    { email: "superadmin2@absensi-hr.local", nama: "Super Admin Dua" },
  ];

  // Collect all admin IDs (existing + newly created)
  const adminIds: string[] = [];

  // First, collect existing admin IDs
  if (existingAdmins) {
    for (const admin of existingAdmins) {
      adminIds.push(admin.id);
    }
  }

  // Then create missing admins
  for (const seed of adminSeeds) {
    // Check if employee already exists with this email and branch
    const { data: existingEmployee } = await db
      .from("employees")
      .select("*")
      .eq("email", seed.email)
      .maybeSingle();

    if (existingEmployee && existingEmployee.branch_id === branch!.id) {
      if (!adminIds.includes(existingEmployee.id)) {
        adminIds.push(existingEmployee.id);
      }
      continue;
    }

    // Try to create auth user
    let userId: string;
    const { data: authUser, error: authError } = await db.auth.admin.createUser({
      email: seed.email,
      password: "ChangeMe123!",
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes("already been registered")) {
        // User exists in auth - try to find by email across all employees
        if (existingEmployee) {
          // Employee exists with this email - use it
          if (!adminIds.includes(existingEmployee.id)) {
            adminIds.push(existingEmployee.id);
          }
        }
        // If employee doesn't exist either, just skip - data is inconsistent
        continue;
      } else {
        throw new Error(`Failed to create auth user for ${seed.email}: ${authError.message}`);
      }
    }

    userId = authUser!.user!.id;

    const { data: employee, error: insertError } = await db
      .from("employees")
      .insert({
        id: userId,
        nama: seed.nama,
        email: seed.email,
        branch_id: branch!.id,
        jabatan: "Super Admin",
        status_kontrak: "tetap",
        tanggal_mulai_kerja: "2026-01-01",
        role: "super_admin",
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert employee ${seed.email}: ${insertError.message}`);
    }

    adminIds.push(employee!.id);
  }

  // Update cross-references (ensure we have exactly 2)
  if (adminIds.length >= 2) {
    await db.from("employees").update({ designated_approver_id: adminIds[1] }).eq("id", adminIds[0]);
    await db.from("employees").update({ designated_approver_id: adminIds[0] }).eq("id", adminIds[1]);
  }
}

if (require.main === module) {
  runSeed().then(() => {
    console.log("Seed complete.");
    process.exit(0);
  });
}
