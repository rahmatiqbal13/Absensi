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

function initialsOf(nama: string): string {
  return nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

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
      <PageHeader
        eyebrow="Akun" title="Profil" description="Data diri dan pengaturan akun Anda." />

      <section className="flex items-center gap-4 rounded-[18px] bg-primary p-5 text-primary-foreground">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={photoUrl} alt="" className="size-16 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-16 shrink-0 place-items-center rounded-full bg-[#C4B5FD] text-xl font-semibold text-[#14162E]"
          >
            {initialsOf(row?.nama ?? me.nama)}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-xl font-semibold">{row?.nama ?? me.nama}</span>
          <span className="truncate text-sm text-primary-foreground/80">
            {[row?.jabatan, branchNama !== "-" ? branchNama : null].filter(Boolean).join(" · ") || "-"}
          </span>
          <span className="mt-1 self-start rounded-full bg-info px-2.5 py-0.5 text-xs font-semibold text-info-foreground">
            {ROLE_LABEL[row?.role ?? me.role] ?? "-"}
          </span>
        </div>
      </section>

      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-4 text-sm">
        {[
          ["Email", me.email],
          ["Departemen", deptNama],
          ["Mulai Kerja", row?.tanggal_mulai_kerja ?? "-"],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="col-span-2 break-words text-foreground">{v}</dd>
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
