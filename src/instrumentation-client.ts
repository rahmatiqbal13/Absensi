import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

// Uncaught errors and unhandled promise rejections in the browser — the
// employee's phone, where failures were invisible before.
Sentry.init({
  ...sentryOptions,
  ignoreErrors: [
    // Browser extensions and flaky mobile networks, not app bugs.
    /extension:\/\//,
    "ResizeObserver loop",
    "Load failed",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
