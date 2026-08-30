"use client";

import { forwardRef, useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export const SignOutButton = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(function SignOutButton({ className, onClick, ...props }, ref) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      ref={ref}
      type="button"
      disabled={pending}
      onClick={(e) => {
        onClick?.(e);
        startTransition(() => signOut());
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {pending ? "Keluar…" : "Keluar"}
    </button>
  );
});
