import type { Metadata } from "next";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { KioskDisplay } from "./kiosk-display";

// A leaked kiosk URL must not end up in a search index.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// A branch-entrance monitor loads /kiosk/<secret-key> with no login. The key is a
// server-only secret: it is read here and passed to the client only so the client
// action can re-fetch a fresh QR — it is never rendered.
// `?embed=1` renders a compact QR-only panel for embedding in another display
// (an iframe slot on the SIMDIR internal agenda TV); see next.config.ts.
export default async function KioskPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { key } = await params;
  const embed = (await searchParams).embed === "1";
  const db = createServiceRoleSupabaseClient();
  const { data: branch, error } = await db
    .from("branches")
    .select("nama, qr_enabled")
    .eq("kiosk_key", key)
    .maybeSingle();
  if (error) console.error("kiosk page: branch lookup failed", error);

  if (!branch || !branch.qr_enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#17154A] p-8 text-center">
        <p className="text-lg text-[#EEF0FF]/70">Kiosk tidak aktif.</p>
      </main>
    );
  }

  return <KioskDisplay kioskKey={key} branchNama={branch.nama ?? "Kiosk"} embed={embed} />;
}
