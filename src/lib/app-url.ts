// Public origin of the app, for links that leave the browser (invite / reset
// links, emails). Never derived from request headers (Host / X-Forwarded-Host
// can be spoofed). Explicit NEXT_PUBLIC_APP_URL wins; on Vercel the production
// domain is the fallback so a deployed app never emits localhost links.
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;
  return "http://localhost:3000";
}
