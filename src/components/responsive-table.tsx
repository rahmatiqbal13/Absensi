// src/components/responsive-table.tsx
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// NOTE: on mobile the FIRST column's cell is rendered as the card's title with
// no label — its `mobileLabel`, `align`, and `hideOnMobile` are ignored.
// Consumers must lead with an identifying column.
export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  headerClassName?: string;
  cellClassName?: string;
  hideOnMobile?: boolean;
  mobileLabel?: string;
};

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  caption,
  emptyState,
  footer,
  footerMobile,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  caption?: string;
  emptyState: React.ReactNode;
  footer?: React.ReactNode;
  footerMobile?: React.ReactNode;
}) {
  if (rows.length === 0) return <>{emptyState}</>;
  // An empty `columns` would make `const [first, ...rest] = columns` yield an
  // undefined `first`, and `first.cell(row)` would throw.
  if (columns.length === 0) return <>{emptyState}</>;

  const alignCls = (a?: "left" | "right") =>
    a === "right" ? "text-right tabular-nums" : "text-left";

  return (
    <>
      {/* desktop */}
      <div className="hidden md:block">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(alignCls(c.align), c.headerClassName)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <TableRow key={rowKey(row)}>
                  {columns.map((c, i) => (
                    <TableCell
                      key={c.key}
                      className={cn(alignCls(c.align), c.cellClassName, href && i === 0 && "relative")}
                    >
                      {href && i === 0 ? (
                        <Link
                          href={href}
                          className="font-medium text-foreground after:absolute after:inset-0"
                        >
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
          {footer ? (
            <TableFooter>
              <TableRow>{footer}</TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      {/* mobile */}
      <div data-slot="responsive-table-cards" className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const [first, ...rest] = columns;
          const inner = (
            <Card size="sm" className="gap-2">
              <div className="text-sm font-medium text-foreground">{first.cell(row)}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {rest
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-muted-foreground">
                        {c.mobileLabel ?? (typeof c.header === "string" ? c.header : c.key)}
                      </dt>
                      <dd className={cn("text-foreground", c.align === "right" && "text-right tabular-nums")}>
                        {c.cell(row)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </Card>
          );
          return href ? (
            <Link key={rowKey(row)} href={href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={rowKey(row)}>{inner}</div>
          );
        })}
        {footerMobile}
      </div>
    </>
  );
}
