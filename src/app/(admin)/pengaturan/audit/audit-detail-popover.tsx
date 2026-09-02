"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function AuditDetailPopover({ detail }: { detail: unknown }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">Lihat</Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 text-[11px] text-foreground">
          {detail == null ? "—" : JSON.stringify(detail, null, 2)}
        </pre>
      </PopoverContent>
    </Popover>
  );
}
