import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus, Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { RoleBadge } from "@/components/role-badge";
import type { Role } from "@/lib/auth/route-access";
import { EmployeeFilters } from "./employee-filters";
import { PageHeader } from "@/components/page-header";
import { ResponsiveTable } from "@/components/responsive-table";
import { StatusPill } from "@/components/status-pill";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signProfilePhotoUrls } from "@/lib/profile/photo";

function initials(nama: string): string {
  return (
    nama
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default async function KaryawanPage({
  searchParams,
}: {
  searchParams: Promise<{ cabang?: string; role?: string; status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const rawStatus = sp.status ?? "aktif";
  const status = rawStatus === "semua" ? null : rawStatus;

  const { data: branches, error: branchesError } = await db
    .from("branches")
    .select("id, nama")
    .order("nama");
  if (branchesError) console.error("Gagal memuat daftar cabang:", branchesError);

  let query = db
    .from("employees")
    .select("id, nama, jabatan, role, status, foto_profil_url, branches(nama)")
    .order("nama");
  if (sp.cabang) query = query.eq("branch_id", sp.cabang);
  if (sp.role) query = query.eq("role", sp.role);
  if (status) query = query.eq("status", status);
  if (sp.q) query = query.ilike("nama", `%${sp.q}%`);

  const { data: rows, error } = await query;

  const photoUrls = rows
    ? await signProfilePhotoUrls(db, rows.map((r) => (r.foto_profil_url as string | null) ?? null))
    : [];
  const photoByRow = new Map<string, string | null>(
    (rows ?? []).map((r, i) => [r.id, photoUrls[i] ?? null]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Karyawan"
        description="Kelola data karyawan dan onboarding."
        actions={
          <Button asChild>
            <Link href="/karyawan/baru">
              <UserPlus className="size-4" /> Tambah Karyawan
            </Link>
          </Button>
        }
      />

      <EmployeeFilters
        branches={branches ?? []}
        defaults={{ cabang: sp.cabang, role: sp.role, status: rawStatus, q: sp.q ?? "" }}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat daftar karyawan.</AlertDescription>
        </Alert>
      )}

      {!error && (
        <ResponsiveTable
          caption="Daftar karyawan"
          columns={[
            {
              key: "nama",
              header: "Nama",
              cell: (r) => (
                <span className="flex items-center gap-2">
                  <Avatar className="size-7">
                    {photoByRow.get(r.id) ? (
                      <AvatarImage src={photoByRow.get(r.id)!} alt="" />
                    ) : null}
                    <AvatarFallback className="text-[0.65rem]">{initials(r.nama)}</AvatarFallback>
                  </Avatar>
                  {r.nama}
                </span>
              ),
            },
            { key: "jabatan", header: "Jabatan", cell: (r) => r.jabatan, mobileLabel: "Jabatan" },
            {
              key: "cabang",
              header: "Cabang",
              cell: (r) => (r.branches as unknown as { nama: string } | null)?.nama ?? "-",
              mobileLabel: "Cabang",
            },
            {
              key: "role",
              header: "Peran",
              cell: (r) => <RoleBadge role={r.role as Role} />,
              mobileLabel: "Peran",
            },
            {
              key: "status",
              header: "Status",
              cell: (r) => <StatusPill status={r.status as "aktif" | "nonaktif"} />,
              mobileLabel: "Status",
            },
          ]}
          rows={rows ?? []}
          rowKey={(r) => r.id}
          rowHref={(r) => `/karyawan/${r.id}`}
          emptyState={
            <EmptyState icon={Users} message="Tidak ada karyawan yang cocok dengan filter." />
          }
        />
      )}
    </div>
  );
}
