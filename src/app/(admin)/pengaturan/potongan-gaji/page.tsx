import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PotonganGajiManager, type AlpaEmployee } from "./potongan-gaji-manager";
import { saveCompanyPotongAlpa, setEmployeesPotongAlpa, saveTarifPph21 } from "./actions";
import { DEFAULT_TARIF_PPH21_PERSEN } from "@/lib/payroll/pph21";

export default async function PotonganGajiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "super_admin") redirect("/pengaturan");

  const [settingsRes, employeesRes, branchesRes] = await Promise.all([
    db.from("app_settings").select("potong_alpa, tarif_pph21_persen").eq("id", 1).maybeSingle(),
    db
      .from("employees")
      .select("id, nama, jabatan, branch_id, potong_alpa, branches(nama)")
      .eq("status", "aktif")
      .order("nama"),
    db.from("branches").select("id, nama").order("nama"),
  ]);
  const loadError = settingsRes.error ?? employeesRes.error ?? branchesRes.error;
  if (loadError) console.error("potongan-gaji: load failed", loadError);

  const employees: AlpaEmployee[] = (
    (employeesRes.data ?? []) as unknown as {
      id: string;
      nama: string;
      jabatan: string;
      branch_id: string;
      potong_alpa: boolean | null;
      branches: { nama: string } | null;
    }[]
  ).map((e) => ({
    id: e.id,
    nama: e.nama,
    jabatan: e.jabatan,
    branchId: e.branch_id,
    branchNama: e.branches?.nama ?? "-",
    potongAlpa: e.potong_alpa,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengaturan"
        title="Potongan gaji"
        description="Tarif PPh 21 dan potongan untuk hari alpa (tidak hadir tanpa izin) — untuk semua karyawan atau karyawan tertentu."
      />
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Gagal memuat pengaturan potongan gaji. Pastikan migrasi database terbaru sudah dijalankan, lalu muat ulang.
          </AlertDescription>
        </Alert>
      ) : (
        <PotonganGajiManager
          companyDefault={settingsRes.data?.potong_alpa === true}
          tarifPph21={
            settingsRes.data?.tarif_pph21_persen == null
              ? DEFAULT_TARIF_PPH21_PERSEN
              : Number(settingsRes.data.tarif_pph21_persen)
          }
          saveTarifPph21={saveTarifPph21}
          employees={employees}
          branches={branchesRes.data ?? []}
          saveCompanyPotongAlpa={saveCompanyPotongAlpa}
          setEmployeesPotongAlpa={setEmployeesPotongAlpa}
        />
      )}
    </div>
  );
}
