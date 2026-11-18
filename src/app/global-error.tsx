"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last resort when the root layout itself fails. Renders its own document
 * without the app's stylesheet, so it is styled inline and follows the OS
 * colour scheme.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          colorScheme: "light dark",
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <title>Terjadi kesalahan</title>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Aplikasi gagal dimuat</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.75, lineHeight: 1.5 }}>
            Kesalahan ini sudah tercatat. Coba muat ulang. Kalau tetap gagal, hubungi HR
            {error.digest ? ` dan sebutkan kode ${error.digest}` : ""}.
          </p>
          <button
            onClick={() => retry()}
            style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
