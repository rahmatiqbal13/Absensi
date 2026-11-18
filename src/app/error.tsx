"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { ProductLogo } from "@/components/product-logo";
import { Button } from "@/components/ui/button";

/** Any page that crashes while rendering. The root layout (and its styles) still applies. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <ProductLogo size={44} tone="default" />
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[0.75rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Terjadi kesalahan
          </span>
          <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em]">
            Halaman gagal dimuat
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Kesalahan ini sudah tercatat. Coba muat ulang. Kalau tetap gagal, hubungi HR
            {error.digest ? (
              <>
                {" "}dan sebutkan kode <span className="font-mono text-foreground">{error.digest}</span>
              </>
            ) : null}
            .
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button className="h-11 px-5" onClick={() => retry()}>
            <RotateCcw /> Coba lagi
          </Button>
          <Button asChild variant="outline" className="h-11 px-5">
            <Link href="/">
              <ArrowLeft /> Ke beranda
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
