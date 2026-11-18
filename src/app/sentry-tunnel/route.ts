// Target of the /monitoring tunnel (next.config.ts). Forwards only the event
// payload to Sentry — no cookies or other request headers — and only for our
// own DSN.
export { POST } from "@sentry/nextjs/tunnel";
