import { NextRequest, NextResponse } from "next/server";
import { setStateCookie } from "@/lib/session";

/** Starts the GitHub OAuth flow: generate a state cookie, then 302 to the GitHub authorize page */
export function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const origin = new URL(req.url).origin;
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not configured; see README for setup" },
      { status: 500 },
    );
  }

  const state = crypto.randomUUID();
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/auth/github/callback`);
  authorizeUrl.searchParams.set("scope", "repo read:user");
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  setStateCookie(res, state);
  return res;
}
