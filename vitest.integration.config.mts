import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Integration suite — runs against the live Supabase project. Opt-in only:
//   npm run test:integration
//
// The globalSetup's teardown removes the "*@test.local" / orphan-branch
// fixtures each run creates, so the project does not accumulate them
// (see ./tests/integration/cleanup-test-data.ts). The default `vitest run`
// uses vitest.config.mts, which is scoped to src/ and never touches the DB.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30000,
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
