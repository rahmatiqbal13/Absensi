import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant placeholder while a page renders on the server (route loading.tsx).
 * Without it the old page just sits there for the ~1 s round trip and people
 * tap again.
 */
function Announce() {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      Memuat halaman…
    </p>
  );
}

/** Admin pages: header + filter bar + table rows. */
export function AdminPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Announce />
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="space-y-2 rounded-xl border border-border p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Employee pages (mobile): a hero card and a few list cards. */
export function EmployeePageSkeleton() {
  return (
    <div className="mx-auto max-w-md space-y-5 p-4 pt-8" aria-busy="true">
      <Announce />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
