"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

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

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="branch" className="text-xs text-muted-foreground">Cabang</Label>
        <NativeSelect
          id="branch"
          defaultValue={selectedBranch}
          onChange={(e) =>
            router.push(e.target.value ? `/dashboard?branch=${e.target.value}` : "/dashboard")
          }
          className="h-9 w-48"
        >
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </NativeSelect>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
        <RefreshCw className="size-4" /> Muat ulang
      </Button>
      {updatedAt && (
        <span className="text-xs text-muted-foreground">Diperbarui {updatedAt}</span>
      )}
    </div>
  );
}
