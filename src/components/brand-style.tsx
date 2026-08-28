import { deriveAccent } from "@/lib/branding/accent";
import { getAppSettings } from "@/lib/branding/get-app-settings";

export async function BrandStyle() {
  const { warnaAksen } = await getAppSettings();
  let d;
  try {
    d = deriveAccent(warnaAksen);
  } catch {
    d = deriveAccent("#2563EB");
  }
  const vars = `--primary: ${d.primary}; --primary-foreground: ${d.primaryForeground}; --ring: ${d.ring};`;
  return (
    // eslint-disable-next-line react/no-danger
    <style dangerouslySetInnerHTML={{ __html: `:root{${vars}}\n.dark{${vars}}` }} />
  );
}
