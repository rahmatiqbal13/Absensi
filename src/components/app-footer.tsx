import { CREDIT } from "@/lib/branding/credit";
import { getAppSettings } from "@/lib/branding/get-app-settings";

export async function AppFooter() {
  const { namaInstansi } = await getAppSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
      © {year} {namaInstansi} · {CREDIT}
    </footer>
  );
}
