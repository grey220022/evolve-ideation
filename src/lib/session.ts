import type { NextRequest, NextResponse } from "next/server";

export const GH_TOKEN_COOKIE = "gh_token";
export const OAUTH_STATE_COOKIE = "gh_oauth_state";

const TOKEN_MAX_AGE = 60 * 60 * 8; // 8 hours
const STATE_MAX_AGE = 60 * 10; // 10 minutes — enough to complete the OAuth flow

export function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(GH_TOKEN_COOKIE)?.value ?? null;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  } as const;
}

export function setTokenCookie(res: NextResponse, token: string): void {
  res.cookies.set(GH_TOKEN_COOKIE, token, { ...baseCookieOptions(), maxAge: TOKEN_MAX_AGE });
}

export function setStateCookie(res: NextResponse, state: string): void {
  res.cookies.set(OAUTH_STATE_COOKIE, state, { ...baseCookieOptions(), maxAge: STATE_MAX_AGE });
}

/** OAuth state is single-use: read it before validation, and always clear it afterwards */
export function consumeState(req: NextRequest): string | null {
  return req.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null;
}

/** Clears only the OAuth state cookie (used on the success path; the token is written separately and must not be clobbered) */
export function clearStateCookie(res: NextResponse): NextResponse {
  res.cookies.set(OAUTH_STATE_COOKIE, "", { ...baseCookieOptions(), maxAge: 0 });
  return res;
}

export function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.set(GH_TOKEN_COOKIE, "", { ...baseCookieOptions(), maxAge: 0 });
  return clearStateCookie(res);
}
