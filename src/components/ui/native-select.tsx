import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// A plain <select> styled to match shadcn <Input>. Used instead of the Radix
// <Select> so form posts (FormData) keep working and fireEvent.change tests
// stay simple. See the plan's Global Constraints.
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  function NativeSelect({ className, children, ...props }, ref) {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          data-slot="native-select"
          className={cn(
            "h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-2.5 py-1 pr-8 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  },
);

export { NativeSelect };
