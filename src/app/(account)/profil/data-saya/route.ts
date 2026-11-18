import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * UU PDP right of access: everything stored about the signed-in employee, as
 * one JSON download. Read with their own client, so RLS limits every table to
 * their own rows. Selfies are listed (date, until when kept) but not embedded.
 */
export async function GET() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return new Response("Tidak diizinkan.", { status: 401 });

  const own = (table: string, cols: string, order = "created_at") =>
    db.from(table).select(cols).eq("employee_id", me.id).order(order, { ascending: false });

  const [profil, absensi, cuti, koreksi, persetujuan, kontrak, slip] = await Promise.all([
    db
      .from("employees")
      .select("nama, email, no_telp, jabatan, status_kontrak, tanggal_mulai_kerja, role, status, branches(nama), departments(nama)")
      .eq("id", me.id)
      .maybeSingle(),
    own(
      "attendances",
      "tanggal, jam_masuk, jam_pulang, status, catatan, lokasi_masuk, lokasi_pulang, metode_masuk, metode_pulang, foto_masuk_expires_at, foto_pulang_expires_at, foto_masuk_url, foto_pulang_url",
      "tanggal",
    ),
    own("leave_requests", "jenis, tanggal_mulai, tanggal_selesai, alasan, status, catatan_approval, created_at"),
    own("attendance_corrections", "tanggal, jam_masuk, jam_pulang, alasan, status, catatan_approval, created_at"),
    own("consents", "jenis, versi_kebijakan, disetujui_at, dicabut_at", "disetujui_at"),
    own("employee_contracts", "jenis, tanggal_mulai, tanggal_selesai, catatan", "tanggal_mulai"),
    db
      .from("payslips")
      .select("gaji_pokok, gaji_akhir, hari_kerja_efektif, payroll_periods!inner(bulan, tahun, status)")
      .eq("employee_id", me.id)
      .eq("payroll_periods.status", "final"),
  ]);

  const rows = <T,>(r: { data: T[] | null; error: unknown }, what: string): T[] | string => {
    if (r.error) {
      console.error(`data-saya: ${what} lookup failed`, r.error);
      return "Gagal dimuat";
    }
    return r.data ?? [];
  };

  type Att = Record<string, unknown> & { foto_masuk_url?: string | null; foto_pulang_url?: string | null };
  const att = rows(absensi as never, "attendances");
  const attendances = Array.isArray(att)
    ? (att as Att[]).map(({ foto_masuk_url, foto_pulang_url, ...a }) => ({
        ...a,
        foto_masuk: foto_masuk_url ? "tersimpan (dihapus otomatis 90 hari)" : "tidak ada / sudah dihapus",
        foto_pulang: foto_pulang_url ? "tersimpan (dihapus otomatis 90 hari)" : "tidak ada / sudah dihapus",
      }))
    : att;

  const body = {
    dibuat_pada: new Date().toISOString(),
    keterangan:
      "Salinan data pribadi Anda yang tersimpan di aplikasi absensi (UU No. 27/2022 tentang Pelindungan Data Pribadi). Foto selfie tidak disertakan dalam file ini.",
    profil: profil.error ? "Gagal dimuat" : profil.data,
    persetujuan: rows(persetujuan as never, "consents"),
    kontrak: rows(kontrak as never, "contracts"),
    absensi: attendances,
    cuti: rows(cuti as never, "leave_requests"),
    koreksi_absensi: rows(koreksi as never, "corrections"),
    slip_gaji: rows(slip as never, "payslips"),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="data-saya-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
