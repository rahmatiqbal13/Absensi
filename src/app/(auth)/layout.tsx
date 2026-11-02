import { AppFooter } from "@/components/app-footer";
import { AuthClockPanel } from "@/components/auth-clock-panel";
import { BrandMark } from "@/components/brand-mark";
import { getAppSettings } from "@/lib/branding/get-app-settings";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { tagline } = await getAppSettings();
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <aside className="hidden flex-col justify-between gap-12 bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <BrandMark size="md" tone="inverse" />
        <AuthClockPanel tagline={tagline ?? "Hadir tepat waktu, tercatat dengan jujur."} />
        <span className="font-mono text-[0.7rem] tracking-[0.12em] text-sidebar-faint uppercase">
          Sistem Absensi HR · WIB
        </span>
      </aside>
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="flex w-full max-w-[380px] flex-col gap-8">
            <div className="lg:hidden">
              <BrandMark size="md" />
            </div>
            {children}
          </div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
