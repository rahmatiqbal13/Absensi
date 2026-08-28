import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BrandStyle } from "@/components/brand-style";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getAppSettings } from "@/lib/branding/get-app-settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getAppSettings();
  return {
    title: { default: s.namaInstansi, template: `%s · ${s.namaInstansi}` },
    description: s.tagline ?? "Sistem absensi, cuti, dan payroll karyawan",
    icons: s.logoUrl ? { icon: s.logoUrl } : undefined,
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Server-rendered accent override — no flash, applies globally regardless
            of DOM position via the :root / .dark selectors. */}
        <BrandStyle />
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
