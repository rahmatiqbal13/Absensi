import { deriveAccent, deriveAccentDark } from "@/lib/branding/accent";
import { getAppSettings } from "@/lib/branding/get-app-settings";

export async function BrandStyle() {
  const { warnaAksen } = await getAppSettings();
  const hex = safeHex(warnaAksen);
  const light = deriveAccent(hex);
  const dark = deriveAccentDark(hex);
  const block = (d: { primary: string; primaryForeground: string; ring: string }) =>
    `--primary: ${d.primary}; --primary-foreground: ${d.primaryForeground}; --ring: ${d.ring};`;
  return (
    // eslint-disable-next-line react/no-danger
    <style
      dangerouslySetInnerHTML={{
        __html: `:root{${block(light)}}\n.dark{${block(dark)}}`,
      }}
    />
  );
}

function safeHex(hex: string): string {
  try {
    deriveAccent(hex);
    return hex;
  } catch {
    return "#2563EB";
  }
}
