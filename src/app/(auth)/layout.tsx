import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <BrandMark size="lg" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">{children}</div>
      </div>
      <AppFooter />
    </main>
  );
}
