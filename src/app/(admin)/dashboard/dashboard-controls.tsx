"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TIME_FMT = new Intl.DateTimeFormat("id-ID", { timeStyle: "medium", timeZone: "Asia/Jakarta" });

export function DashboardControls({
  branches, selectedBranch,
}: {
  branches: { id: string; nama: string }[];
  selectedBranch: string;
}) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<string>(() => TIME_FMT.format(new Date()));

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  // Re-stamp the label whenever this component re-renders after a refresh.
  useEffect(() => {
    setUpdatedAt(TIME_FMT.format(new Date()));
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="branch" className="text-xs text-neutral-500">Cabang</label>
        <select
          id="branch"
          defaultValue={selectedBranch}
          onChange={(e) => router.push(e.target.value ? `/dashboard?branch=${e.target.value}` : "/dashboard")}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
        >
          <option value="">Semua cabang</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select>
      </div>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="min-h-9 rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700"
      >
        Muat ulang
      </button>
      <span className="text-xs text-neutral-400">Diperbarui {updatedAt}</span>
    </div>
  );
}
