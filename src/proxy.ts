import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveRouteAccess } from "@/lib/auth/route-access";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: userData } = await supabase.auth.getUser();
  let role: "karyawan" | "atasan" | "hr_admin" | "super_admin" | null = null;
  if (userData.user) {
    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    role = employee?.role ?? null;
  }

  const decision = resolveRouteAccess(request.nextUrl.pathname, role);
  if (decision === "redirect-login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (decision === "redirect-employee-home") {
    return NextResponse.redirect(new URL("/absen", request.url));
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
