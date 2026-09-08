import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30000,
    // Unit/component tests only. The integration suite hits the live Supabase
    // project and is opt-in via `npm run test:integration`
    // (vitest.integration.config.mts), which also cleans up its fixtures.
    // Keeping it out of the default project means a bare `vitest run` never
    // writes to the real database.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
