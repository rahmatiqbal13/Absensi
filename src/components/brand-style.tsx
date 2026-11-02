import { deriveAccent, deriveAccentDark, deriveBrandText } from "@/lib/branding/accent";
import { getAppSettings } from "@/lib/branding/get-app-settings";

// The tenant accent drives --brand (logo mark, links, highlights, the clock-in
// fill), not --primary: primary actions stay ink so any accent reads as a brand
// colour rather than recolouring every button.
export async function BrandStyle() {
  const { warnaAksen } = await getAppSettings();
  const hex = safeHex(warnaAksen);
  const light = deriveAccent(hex);
  const dark = deriveAccentDark(hex);
  const root = `--brand: ${light.primary}; --brand-foreground: ${light.primaryForeground}; --brand-text: ${deriveBrandText(hex)};`;
  const darkBlock = `--brand: ${dark.primary}; --brand-foreground: ${dark.primaryForeground}; --brand-text: ${dark.primary};`;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `:root{${root}}\n.dark{${darkBlock}}`,
      }}
    />
  );
}

function safeHex(hex: string): string {
  try {
    deriveAccent(hex);
    return hex;
  } catch {
    return "#C63B22";
  }
}
