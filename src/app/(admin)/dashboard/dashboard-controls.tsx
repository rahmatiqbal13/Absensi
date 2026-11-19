"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIME_FMT = new Intl.DateTimeFormat("id-ID", { timeStyle: "medium", timeZone: "Asia/Jakarta" });

export function DashboardControls({
  branches,
  selectedBranch,
}: {
  branches: { id: string; nama: string }[];
  selectedBranch: string;
}) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const stamp = () => setUpdatedAt(TIME_FMT.format(new Date()));
    stamp();
    const id = setInterval(() => {
      router.refresh();
      stamp();
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  const options = [{ id: "", nama: "Semua cabang" }, ...branches];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav
        aria-label="Cabang"
        className="flex flex-wrap gap-0.5 rounded-[10px] bg-muted p-[3px]"
      >
        {options.map((b) => {
          const active = b.id === selectedBranch;
          return (
            <Link
              key={b.id || "semua"}
              href={b.id ? `/dashboard?branch=${b.id}` : "/dashboard"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-[8px] px-3 text-[0.8rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:shadow-[inset_0_0_0_1px_var(--input)]",
              )}
            >
              {b.nama}
            </Link>
          );
        })}
      </nav>
      <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
        <RefreshCw className="size-4" /> Muat ulang
      </Button>
      {updatedAt && (
        <span className="text-xs text-muted-foreground">Diperbarui {updatedAt}</span>
      )}
    </div>
  );
}
