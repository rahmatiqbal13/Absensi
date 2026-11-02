import { getAppSettings } from "@/lib/branding/get-app-settings";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-7 w-7", text: "text-sm", name: "text-sm" },
  md: { box: "h-9 w-9", text: "text-base", name: "text-base" },
  lg: { box: "h-12 w-12", text: "text-lg", name: "text-lg" },
} as const;

export async function BrandMark({
  size = "md",
  showName = true,
  tone = "default",
  className,
}: {
  size?: keyof typeof SIZES;
  showName?: boolean;
  // "inverse" sits on the ink sidebar / kiosk, where --foreground would vanish.
  tone?: "default" | "inverse";
  className?: string;
}) {
  const { namaInstansi, namaSingkat, logoUrl } = await getAppSettings();
  const s = SIZES[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={namaInstansi}
          className={cn(s.box, "rounded-lg object-contain")}
        />
      ) : (
        <div
          className={cn(
            s.box,
            s.text,
            "flex items-center justify-center rounded-lg bg-brand font-semibold text-brand-foreground",
          )}
        >
          {(namaSingkat[0] ?? "A").toUpperCase()}
        </div>
      )}
      {showName && (
        <span
          className={cn(s.name, "font-semibold", tone === "inverse" ? "text-sidebar-foreground" : "text-foreground")}
        >
          {namaSingkat}
        </span>
      )}
    </div>
  );
}
