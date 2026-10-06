import { NextRequest, NextResponse } from "next/server";
import { GhError, listRepos } from "@/lib/github";
import { getSessionToken } from "@/lib/session";

/** The authenticated user's repo list (for the frontend picker) */
export async function GET(req: NextRequest) {
  const token = getSessionToken(req);
  if (!token) {
    return NextResponse.json({ error: "Not connected to GitHub; please authorize first" }, { status: 401 });
  }
  try {
    const repos = await listRepos(token);
    return NextResponse.json({ repos });
  } catch (e) {
    const status = e instanceof GhError ? e.status : 502;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch repositories" },
      { status },
    );
  }
}
