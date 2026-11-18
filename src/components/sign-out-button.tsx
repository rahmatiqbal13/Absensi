"use client";

import { forwardRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export const SignOutButton = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(function SignOutButton({ className, onClick, ...props }, ref) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={(e) => {
          onClick?.(e);
          if (!pending) startTransition(() => signOut());
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="h-4 w-4" aria-hidden="true" />
        )}
        {pending ? "Keluar…" : "Keluar"}
      </button>
      {/* Signing out takes a round trip + redirect; cover the page so it is
          obvious something is happening and nothing else gets clicked. */}
      {pending &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-sm"
          >
            <span className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Sedang keluar…
            </span>
          </div>,
          document.body,
        )}
    </>
  );
});
