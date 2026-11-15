import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let refreshedCookieCount = 0;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          refreshedCookieCount += cookiesToSet.length;
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value)
          );
        },
      },
    }
  );

  // Refresh the session cookie before rendering. Authorization is enforced by
  // the dashboard server layout with getUser() and the CRM role check; keeping
  // that decision in one place avoids silently bouncing valid sessions here
  // when the optimistic claims check encounters a transient verification error.
  const { data: { user }, error } = await supabase.auth.getUser();

  if (process.env.NODE_ENV === "development") {
    console.info("[auth] dashboard proxy session check", {
      authCookiePresent: request.cookies.getAll().some(({ name }) => /-auth-token(?:\.\d+)?$/.test(name)),
      serverRecognizedUser: Boolean(user),
      authErrorCode: error?.code ?? null,
      refreshedCookieCount,
    });
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
