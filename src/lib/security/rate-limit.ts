import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

export type RateLimitRule = { key: string; max: number; windowSeconds: number };

/**
 * The end user's IP as reported by the hosting proxy. On Vercel both headers
 * are set by the platform (a client-sent value is overwritten). Behind another
 * proxy, make sure it sets / sanitizes them too, or the limiter can be dodged.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Records one hit against every rule and returns false if any is over its
 * limit. `service` must be the service-role client (rate_limit_hit is granted
 * to it only). Fails open: a limiter outage must not lock everyone out.
 */
export async function withinRateLimit(service: SupabaseClient, rules: RateLimitRule[]): Promise<boolean> {
  const results = await Promise.all(
    rules.map(async (r) => {
      const { data, error } = await service.rpc("rate_limit_hit", {
        p_key: r.key,
        p_max: r.max,
        p_window_seconds: r.windowSeconds,
      });
      if (error) {
        console.error("rate limit check failed; allowing request", r.key.split(":")[0], error);
        return true;
      }
      return data !== false;
    }),
  );
  return results.every(Boolean);
}

export const RATE_LIMITED_MESSAGE = "Terlalu banyak percobaan. Coba lagi dalam 15 menit.";
