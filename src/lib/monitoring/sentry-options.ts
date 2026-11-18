/**
 * Sentry options shared by the browser, Node and Edge runtimes. Without
 * NEXT_PUBLIC_SENTRY_DSN the SDK stays disabled, so local dev, tests and a
 * deploy before the Sentry project exists send nothing.
 *
 * Errors only: no performance tracing and no session replay (the absen page
 * shows selfies and location — not something to record).
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // UU PDP: no IP addresses, cookies or request bodies.
  sendDefaultPii: false,
  tracesSampleRate: 0,
};
