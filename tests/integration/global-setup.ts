// Vitest globalSetup for the integration suite. The returned function runs once
// after every integration test file completes, scrubbing the test fixtures the
// suite creates in the live Supabase project. See ./cleanup-test-data.ts.
import { config } from "dotenv";

config({ path: ".env.local" });

export async function setup(): Promise<void> {
  // nothing to do up front
}

export async function teardown(): Promise<void> {
  const { cleanupIntegrationTestData } = await import("./cleanup-test-data");
  await cleanupIntegrationTestData();
}
