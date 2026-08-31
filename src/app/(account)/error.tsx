"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Terjadi kesalahan saat memuat halaman ini.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        Coba lagi
      </button>
    </div>
  );
}
