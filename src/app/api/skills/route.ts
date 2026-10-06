import { NextRequest, NextResponse } from "next/server";
import { GhError, getDefaultBranch, listSkillFiles, parseRepo } from "@/lib/github";
import { getSessionToken } from "@/lib/session";

/**
 * Scans a repo for SKILL.md files (any depth under .claude/ plus the root skills/ dir).
 * GET /api/skills?repo=owner/name (GitHub URLs, .git addresses, etc. are also accepted and normalized)
 */
export async function GET(req: NextRequest) {
  const token = getSessionToken(req);
  if (!token) {
    return NextResponse.json({ error: "Not connected to GitHub; please authorize first" }, { status: 401 });
  }

  const repoParam = req.nextUrl.searchParams.get("repo") ?? "";
  const parsed = parseRepo(repoParam);
  if (!parsed) {
    return NextResponse.json(
      { error: "Unrecognized repo address; supported: owner/name, GitHub URL, or .git address" },
      { status: 400 },
    );
  }

  try {
    const branch = await getDefaultBranch(token, parsed.owner, parsed.name);
    const { skills, truncated } = await listSkillFiles(
      token,
      parsed.owner,
      parsed.name,
      branch,
    );
    return NextResponse.json({
      repo: `${parsed.owner}/${parsed.name}`,
      branch,
      skills,
      truncated,
    });
  } catch (e) {
    const status = e instanceof GhError ? (e.status === 404 ? 404 : e.status) : 502;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to scan skills" },
      { status },
    );
  }
}
