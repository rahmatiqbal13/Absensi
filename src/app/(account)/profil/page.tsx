import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentEmployee } from "@/lib/auth/session";
import { signProfilePhotoUrl } from "@/lib/profile/photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProfilForm } from "./profil-form";
import { removePhoto, updatePhone, uploadPhoto } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  karyawan: "Karyawan", atasan: "Atasan", hr_admin: "HR Admin", super_admin: "Super Admin",
};

export default async function ProfilPage() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");

  const { data: row, error } = await db
    .from("employees")
    .select("nama, jabatan, no_telp, foto_profil_url, tanggal_mulai_kerja, role, branches(nama), departments(nama)")
    .eq("id", me.id)
    .single();

  if (error || !row) {
    console.error("profil: query failed", error);
    return (
      <div className="mx-auto w-full max-w-lg p-4">
        <p className="text-sm text-destructive">
          Gagal memuat data profil. Coba muat ulang halaman.
        </p>
      </div>
    );
  }

  const photoUrl = await signProfilePhotoUrl(db, row?.foto_profil_url ?? null);
  const branchNama = (row?.branches as unknown as { nama: string } | null)?.nama ?? "-";
  const deptNama = (row?.departments as unknown as { nama: string } | null)?.nama ?? "-";

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 p-4">
      <PageHeader title="Profil" description="Data diri dan pengaturan akun Anda." />

      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-4 text-sm">
        {[
          ["Nama", row?.nama ?? me.nama],
          ["Email", me.email],
          ["Jabatan", row?.jabatan ?? "-"],
          ["Cabang", branchNama],
          ["Departemen", deptNama],
          ["Peran", ROLE_LABEL[row?.role ?? me.role] ?? "-"],
          ["Mulai Kerja", row?.tanggal_mulai_kerja ?? "-"],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="col-span-2 text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <ProfilForm
        defaultPhone={row?.no_telp ?? ""}
        nama={row?.nama ?? me.nama}
        photoUrl={photoUrl}
        updatePhone={updatePhone}
        uploadPhoto={uploadPhoto}
        removePhoto={removePhoto}
      />

      <div className="border-t border-border pt-4">
        <SignOutButton className="w-full justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted sm:w-auto" />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-foreground">Tema</span>
        <ThemeToggle />
      </div>
    </div>
  );
}
