import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies, clearStateCookie, consumeState, setTokenCookie } from "@/lib/session";

type AccessTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

/** OAuth callback: validate state → exchange code for an access_token → store it in an httpOnly cookie */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = consumeState(req);

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(message)}`);

  if (!code) return fail("GitHub did not return an authorization code");
  if (!state || !expectedState || state !== expectedState) {
    return clearAuthCookies(fail("State validation failed; please start authorization again"));
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return clearAuthCookies(fail("Server is missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET"));
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${origin}/api/auth/github/callback`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as AccessTokenResponse;

  if (!data.access_token) {
    return clearAuthCookies(
      fail(data.error_description || data.error || "Token exchange failed"),
    );
  }

  const redirect = NextResponse.redirect(`${origin}/`);
  // Clear only the state cookie. clearAuthCookies was previously (mis)used here and
  // clobbered the freshly written token cookie, leaving the user logged out after a successful auth.
  clearStateCookie(redirect);
  setTokenCookie(redirect, data.access_token);
  return redirect;
}
