"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      // SP1 ships no ThemeToggle and no theme-aware shells yet. Force light until
      // SP2 mounts the toggle and makes AdminShell/EmployeeShell dark-aware, then
      // flip to defaultTheme="system" + enableSystem.
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
