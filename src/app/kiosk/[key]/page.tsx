import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { KioskDisplay } from "./kiosk-display";

// A branch-entrance monitor loads /kiosk/<secret-key> with no login. The key is a
// server-only secret: it is read here and passed to the client only so the client
// action can re-fetch a fresh QR — it is never rendered.
export default async function KioskPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const db = createServiceRoleSupabaseClient();
  const { data: branch } = await db
    .from("branches")
    .select("nama, qr_enabled")
    .eq("kiosk_key", key)
    .maybeSingle();

  if (!branch || !branch.qr_enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-8 text-center">
        <p className="text-lg text-neutral-400">Kiosk tidak aktif.</p>
      </main>
    );
  }

  return <KioskDisplay kioskKey={key} branchNama={branch.nama} />;
}
