import { cn } from "@/lib/utils";

export type EyebrowTone = "indigo" | "success" | "info" | "leave" | "warning";

const TONE_CLASS: Record<EyebrowTone, string> = {
  indigo: "bg-[#E0E4FF] text-[#3A30B8] dark:bg-primary/20 dark:text-primary",
  success: "bg-success text-success-foreground",
  info: "bg-info text-info-foreground",
  leave: "bg-leave text-leave-foreground",
  warning: "bg-warning text-warning-foreground",
};

// One hue per area, matching the sidebar icon tints.
function toneFor(eyebrow: string): EyebrowTone {
  const e = eyebrow.toLowerCase();
  if (e.startsWith("papan")) return "success";
  if (e.startsWith("orang")) return "info";
  if (e.startsWith("kotak masuk")) return "leave";
  if (e.startsWith("angka") || e.startsWith("payroll")) return "warning";
  return "indigo";
}

/** Small mono pill with a dot ("ORANG", "ANGKA") that sits above titles. */
export function EyebrowPill({
  children,
  tone,
  className,
}: {
  children: string;
  tone?: EyebrowTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] self-start rounded-full px-[11px] py-[5px] font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase",
        TONE_CLASS[tone ?? toneFor(children)],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  eyebrowTone,
  actions,
}: {
  title: string;
  description?: string;
  // Small mono section label above the title ("Orang", "Angka", "Sistem").
  eyebrow?: string;
  eyebrowTone?: EyebrowTone;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        {eyebrow && <EyebrowPill tone={eyebrowTone}>{eyebrow}</EyebrowPill>}
        <h1 className="text-[clamp(1.75rem,4vw,2.75rem)] leading-none font-semibold tracking-[-0.03em] text-foreground">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** Section heading with the redesign's small coloured square marker. */
export function SectionTitle({
  children,
  marker = "bg-primary",
  as: Tag = "h2",
  className,
}: {
  children: React.ReactNode;
  /** Tailwind bg class for the marker square. */
  marker?: string;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag className={cn("flex items-center gap-2.5 text-[1.05rem] font-semibold", className)}>
      <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-[3px]", marker)} />
      {children}
    </Tag>
  );
}
