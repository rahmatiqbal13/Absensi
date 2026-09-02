"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function AuditDetailPopover({ detail, label }: { detail: unknown; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label ? `Lihat detail — ${label}` : "Lihat detail perubahan"}
        >
          Lihat
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 text-[11px] text-foreground">
          {detail == null ? "—" : JSON.stringify(detail, null, 2)}
        </pre>
      </PopoverContent>
    </Popover>
  );
}
