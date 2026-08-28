"use client";

import { deriveAccent } from "@/lib/branding/accent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function BrandPreview({ hex, namaSingkat }: { hex: string; namaSingkat: string }) {
  let vars: React.CSSProperties = {};
  try {
    const d = deriveAccent(hex);
    vars = {
      ["--primary" as string]: d.primary,
      ["--primary-foreground" as string]: d.primaryForeground,
      ["--ring" as string]: d.ring,
    };
  } catch {
    /* invalid hex — show the inherited theme */
  }
  const initial = (namaSingkat[0] ?? "A").toUpperCase();
  return (
    <div className="space-y-3">
      {(["light", "dark"] as const).map((mode) => (
        <div
          key={mode}
          style={vars}
          className={`${mode === "dark" ? "dark bg-neutral-950" : "bg-white"} flex items-center gap-3 rounded-xl border border-border p-4`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
            {initial}
          </div>
          <Button size="sm">Tombol</Button>
          <Badge>Label</Badge>
        </div>
      ))}
    </div>
  );
}
