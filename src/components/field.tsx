import { cloneElement, isValidElement } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  let enhanced: React.ReactNode = children;
  if (isValidElement(children)) {
    const child = children as React.ReactElement<{
      id?: string;
      "aria-describedby"?: string;
    }>;
    const describedBy = [child.props["aria-describedby"], hintId, errorId]
      .filter(Boolean)
      .join(" ") || undefined;
    enhanced = cloneElement(child as React.ReactElement<Record<string, unknown>>, {
      id: child.props.id ?? id,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy,
    });
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {enhanced}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
