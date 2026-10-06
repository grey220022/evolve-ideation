import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/github";
import { getSessionToken } from "@/lib/session";
import type { MeResponse } from "@/types";

function configStatus() {
  return {
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    glm: Boolean(process.env.GLM_API_KEY),
  };
}

/** Current connection state: includes the GitHub user when connected; an invalid token is treated as disconnected */
export async function GET(req: NextRequest) {
  const token = getSessionToken(req);
  if (token) {
    try {
      const user = await getAuthenticatedUser(token);
      return NextResponse.json({ connected: true, user, config: configStatus() } satisfies MeResponse);
    } catch {
      // expired/invalid token → report as disconnected
    }
  }
  return NextResponse.json({ connected: false, config: configStatus() } satisfies MeResponse);
}
