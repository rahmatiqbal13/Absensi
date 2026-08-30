import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center">
            <BrandMark size="lg" />
          </div>
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">{children}</div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
