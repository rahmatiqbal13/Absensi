"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60",
        className,
      )}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {pending ? "Keluar…" : "Keluar"}
    </button>
  );
}
