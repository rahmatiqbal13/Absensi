import Link from "next/link";
import { redirect } from "next/navigation";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { getCurrentEmployee } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/route-access";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (employee) redirect(homePathForRole(employee.role));

  const { tagline } = await getAppSettings();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <BrandMark size="lg" />
          {tagline && <p className="text-sm text-muted-foreground">{tagline}</p>}
          <Button asChild className="w-full">
            <Link href="/login">Masuk</Link>
          </Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
