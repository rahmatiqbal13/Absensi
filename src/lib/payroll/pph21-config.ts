import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TARIF_PPH21_PERSEN, type Pph21Config, type TerBracket, type TerKategori } from "./pph21";

/**
 * Reads the PPh 21 method and its tables (migrations 0036 + 0039). No silent
 * fallback: a payslip with the wrong tax is worse than a run that stops.
 */
export async function loadPph21Config(
  db: SupabaseClient,
): Promise<{ ok: true; config: Pph21Config } | { ok: false; error: string }> {
  const { data: s, error } = await db
    .from("app_settings")
    .select("tarif_pph21_persen, metode_pph21")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("loadPph21Config: app_settings lookup failed", error);
    return { ok: false, error: "Gagal memuat pengaturan PPh 21. Pastikan migrasi database terbaru sudah dijalankan." };
  }
  if (s?.metode_pph21 === "tarif_tetap") {
    const tarif = s.tarif_pph21_persen == null ? DEFAULT_TARIF_PPH21_PERSEN : Number(s.tarif_pph21_persen);
    return { ok: true, config: { metode: "tarif_tetap", tarifPersen: tarif } };
  }

  const [ratesRes, ptkpRes] = await Promise.all([
    db.from("pph21_ter_rates").select("kategori, batas_bawah, tarif_persen"),
    db.from("pph21_ptkp_kategori").select("status_ptkp, kategori"),
  ]);
  if (ratesRes.error || ptkpRes.error) {
    console.error("loadPph21Config: TER tables lookup failed", ratesRes.error ?? ptkpRes.error);
    return { ok: false, error: "Gagal memuat tabel TER PPh 21." };
  }
  const brackets: TerBracket[] = (ratesRes.data ?? []).map((r) => ({
    kategori: r.kategori as TerKategori,
    batasBawah: Number(r.batas_bawah),
    tarifPersen: Number(r.tarif_persen),
  }));
  const kategoriByPtkp: Record<string, TerKategori> = Object.fromEntries(
    (ptkpRes.data ?? []).map((r) => [r.status_ptkp as string, r.kategori as TerKategori]),
  );
  for (const k of ["A", "B", "C"] as const) {
    if (!brackets.some((b) => b.kategori === k && b.batasBawah === 0)) {
      return { ok: false, error: `Tabel TER kategori ${k} belum lengkap (harus mulai dari Rp 0).` };
    }
  }
  return { ok: true, config: { metode: "ter", brackets, kategoriByPtkp } };
}
