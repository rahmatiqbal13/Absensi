import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { ProductLogo } from "@/components/product-logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Halaman tidak ditemukan" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
          <ProductLogo size={44} tone="default" />
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[0.75rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Error 404
            </span>
            <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em]">
              Halaman tidak ditemukan
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Alamat ini tidak ada, sudah dipindahkan, atau Anda tidak punya akses ke data tersebut.
            </p>
          </div>
          <Button asChild className="h-11 px-5">
            <Link href="/">
              <ArrowLeft /> Kembali ke beranda
            </Link>
          </Button>
          <BrandMark size="sm" className="mt-4 opacity-80" />
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
