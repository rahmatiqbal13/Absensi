"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes injects an inline <script> that applies the saved theme before
// first paint. The server-rendered copy is the one that runs. When React
// renders the provider on the client, it logs "Encountered a script tag while
// rendering React component" (dev only, but Sentry picks up the console.error)
// for any executable <script>. A non-JS type marks the client copy as a data
// block, which React skips; the server copy keeps the default type so the
// script still runs. next-themes sets suppressHydrationWarning on the tag, so
// the differing `type` doesn't cause a hydration error.
const scriptProps = typeof window === "undefined" ? undefined : { type: "text/plain" };

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  );
}
