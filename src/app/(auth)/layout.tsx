import { AppFooter } from "@/components/app-footer";
import { AuthClockPanel } from "@/components/auth-clock-panel";
import { BrandMark } from "@/components/brand-mark";
import { ProductLogo } from "@/components/product-logo";
import { getAppSettings } from "@/lib/branding/get-app-settings";

// Decorative strip of attendance squares (mostly on time, a few late / leave /
// absent) — the board motif from the dashboard. Fixed, not data.
const STRIP = "hhhhhhhllhhhhhhhhihhhhhhhhhcchhhhhhahhhhhh"; // 3 rows of 14
const STRIP_COLOR: Record<string, string> = {
  h: "#2DD4A8",
  l: "#FFC53D",
  i: "#38BDF8",
  c: "#A78BFA",
  a: "#FF6B72",
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { tagline } = await getAppSettings();
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <aside className="motif-batik-full hidden flex-col justify-between gap-12 bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex flex-col items-start gap-3.5">
          <ProductLogo size={44} />
          {/* The company (instansi) logo + name, uploaded in Pengaturan → Instansi. */}
          <div className="rounded-[10px] bg-sidebar-accent/70 px-3 py-2">
            <BrandMark size="md" tone="inverse" />
          </div>
        </div>
        <AuthClockPanel tagline={tagline ?? "Hadir tepat waktu, tercatat dengan jujur."} />
        <div className="flex flex-col gap-4.5">
          <div aria-hidden="true" className="flex max-w-[364px] flex-wrap gap-1.5">
            {STRIP.split("").map((k, i) => (
              <span key={i} className="size-5 rounded-[5px]" style={{ background: STRIP_COLOR[k] }} />
            ))}
          </div>
          <span className="font-mono text-[0.7rem] tracking-[0.12em] text-sidebar-faint uppercase">
            tapabsen · Sistem Absensi HR · WIB
          </span>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="flex w-full max-w-[380px] flex-col gap-8">
            <div className="flex flex-col items-start gap-2 lg:hidden">
              <ProductLogo size={36} tone="default" />
              <BrandMark size="sm" />
            </div>
            {children}
          </div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
