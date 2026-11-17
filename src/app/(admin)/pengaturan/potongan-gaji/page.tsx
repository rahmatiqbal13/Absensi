import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PotonganGajiManager, type AlpaEmployee } from "./potongan-gaji-manager";
import {
  saveCompanyPotongAlpa,
  setEmployeesPotongAlpa,
  saveTarifPph21,
  saveMetodePph21,
  saveTerTable,
  savePtkpKategori,
} from "./actions";
import { Pph21Settings } from "./pph21-settings";
import { DEFAULT_TARIF_PPH21_PERSEN } from "@/lib/payroll/pph21";

export default async function PotonganGajiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "super_admin") redirect("/pengaturan");

  const [settingsRes, employeesRes, branchesRes, terRes, ptkpRes] = await Promise.all([
    db.from("app_settings").select("potong_alpa, tarif_pph21_persen, metode_pph21").eq("id", 1).maybeSingle(),
    db
      .from("employees")
      .select("id, nama, jabatan, branch_id, potong_alpa, branches(nama)")
      .eq("status", "aktif")
      .order("nama"),
    db.from("branches").select("id, nama").order("nama"),
    db.from("pph21_ter_rates").select("kategori, batas_bawah, tarif_persen").order("batas_bawah"),
    db.from("pph21_ptkp_kategori").select("status_ptkp, kategori"),
  ]);
  const loadError = settingsRes.error ?? employeesRes.error ?? branchesRes.error ?? terRes.error ?? ptkpRes.error;
  type K = "A" | "B" | "C";
  const brackets: Record<K, { batasBawah: number; tarifPersen: number }[]> = { A: [], B: [], C: [] };
  for (const r of terRes.data ?? []) {
    brackets[r.kategori as K]?.push({ batasBawah: Number(r.batas_bawah), tarifPersen: Number(r.tarif_persen) });
  }
  const ptkpMap = Object.fromEntries((ptkpRes.data ?? []).map((r) => [r.status_ptkp as string, r.kategori as K]));
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
        <div className="space-y-4">
        <Pph21Settings
          metode={settingsRes.data?.metode_pph21 === "tarif_tetap" ? "tarif_tetap" : "ter"}
          tarifTetap={
            settingsRes.data?.tarif_pph21_persen == null
              ? DEFAULT_TARIF_PPH21_PERSEN
              : Number(settingsRes.data.tarif_pph21_persen)
          }
          brackets={brackets}
          ptkpMap={ptkpMap}
          saveMetodePph21={saveMetodePph21}
          saveTarifPph21={saveTarifPph21}
          saveTerTable={saveTerTable}
          savePtkpKategori={savePtkpKategori}
        />
        <PotonganGajiManager
          companyDefault={settingsRes.data?.potong_alpa === true}
          employees={employees}
          branches={branchesRes.data ?? []}
          saveCompanyPotongAlpa={saveCompanyPotongAlpa}
          setEmployeesPotongAlpa={setEmployeesPotongAlpa}
        />
        </div>
      )}
    </div>
  );
}
