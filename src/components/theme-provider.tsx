"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      // Chrome (shells + entry pages) is dark-aware, but ~23 not-yet-redesigned
      // admin/employee PAGE BODIES still use hardcoded text-neutral-900 / bg-white
      // with no dark: variants — they'd be unreadable in .dark. SP5's final task
      // migrates the bodies, inverts the legacy --color-neutral-* ramp under .dark,
      // then flips this to defaultTheme="system" + enableSystem + drops forcedTheme.
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
