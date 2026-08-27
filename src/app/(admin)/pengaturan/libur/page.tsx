import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { HolidayForm } from "./holiday-form";
import { addHoliday, deleteHoliday } from "./actions";

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" });

export default async function LiburPage({
  searchParams,
}: {
  searchParams: Promise<{ tahun?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const tahun = sp.tahun ?? String(new Date().getFullYear());
  const { data: branches } = await db.from("branches").select("id, nama").order("nama");
  const { data: holidays, error } = await db
    .from("holidays")
    .select("id, tanggal, nama, branches(nama)")
    .gte("tanggal", `${tahun}-01-01`)
    .lte("tanggal", `${tahun}-12-31`)
    .order("tanggal");

  async function remove(id: string) {
    "use server";
    const res = await deleteHoliday(id);
    if (!res.ok) console.error("LiburPage: deleteHoliday failed", res.error);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Hari Libur {tahun}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Dipakai payroll untuk menghitung hari kerja efektif.
        </p>
      </div>

      <HolidayForm branches={branches ?? []} addHoliday={addHoliday} />

      {error && <p className="text-sm text-red-600">Gagal memuat daftar libur.</p>}
      {!error && (!holidays || holidays.length === 0) && (
        <p className="text-sm text-neutral-500">Belum ada libur tercatat untuk {tahun}.</p>
      )}

      {holidays && holidays.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white text-sm">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between px-4 py-2">
              <span>
                <span className="font-medium">{h.nama}</span>{" "}
                <span className="text-neutral-500">
                  · {fmt.format(new Date(`${h.tanggal}T00:00:00Z`))}
                  {(h.branches as unknown as { nama: string } | null)?.nama
                    ? ` · ${(h.branches as unknown as { nama: string }).nama}`
                    : " · Nasional"}
                </span>
              </span>
              <form action={remove.bind(null, h.id)}>
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Hapus
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
