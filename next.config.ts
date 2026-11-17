import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Supabase is reached from the browser for storage images (logo, profile and
// leave attachment signed URLs) and by the set-password page's auth client.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";
const supabaseWs = supabase.replace(/^http/, "ws");

// No nonces: they would force every page to render dynamically, and the app
// injects a server-rendered <style> (BrandStyle) and the theme script inline.
// 'unsafe-inline' scripts stay allowed; the rest still blocks injected
// third-party scripts / frames / form targets, which is the main win.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase} https://tile.openstreetmap.org`,
  "font-src 'self'",
  `connect-src 'self' ${supabase} ${supabaseWs}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera (selfie, QR scan) and location (geofence) are used by the app
  // itself only; everything else is off.
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), browsing-topics=()",
  },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Clock-in posts a selfie. The client compresses it (~150–400 KB), but an
      // uncompressed fallback from an older phone can still be a few MB; the 1 MB
      // default rejected those before our code ran. Kept under the ~4.5 MB
      // request cap of serverless hosting.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
