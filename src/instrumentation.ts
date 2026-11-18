import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

export async function register() {
  Sentry.init({
    ...sentryOptions,
    // Server code mostly logs a failure with console.error and returns an
    // Indonesian message instead of throwing (clock-in, payroll, email...).
    // Forward those logs so handled failures are visible too, not just crashes.
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
  });
}

// Uncaught errors in Server Components, route handlers and server actions.
export const onRequestError = Sentry.captureRequestError;
