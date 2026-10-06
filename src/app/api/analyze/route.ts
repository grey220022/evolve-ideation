import { NextRequest, NextResponse } from "next/server";
import {
  GhError,
  getDefaultBranch,
  fetchFileContent,
  isSkillPath,
  parseRepo,
} from "@/lib/github";
import { runAnalysis } from "@/lib/glm";
import { getSessionToken } from "@/lib/session";
import type { AnalyzeResponse } from "@/types";

type AnalyzeBody = {
  repo?: string;
  path?: string;
};

/**
 * Analyzes a single SKILL.md: fetch the file → call GLM for review suggestions.
 * POST { repo: "owner/name", path: ".claude/skills/<name>/SKILL.md" }
 * One skill per request; the frontend dispatches them one by one, which yields
 * natural progress and avoids concurrent LLM rate limits.
 */
export async function POST(req: NextRequest) {
  const token = getSessionToken(req);
  if (!token) {
    return NextResponse.json({ error: "Not connected to GitHub; please authorize first" }, { status: 401 });
  }
  if (!process.env.GLM_API_KEY) {
    return NextResponse.json(
      { error: "GLM_API_KEY is not configured; set it in .env.local" },
      { status: 500 },
    );
  }

  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON" }, { status: 400 });
  }

  const parsed = body.repo ? parseRepo(body.repo) : null;
  if (!parsed) {
    return NextResponse.json(
      { error: "Unrecognized repo address; supported: owner/name, GitHub URL, or .git address" },
      { status: 400 },
    );
  }
  const path = body.path ?? "";
  if (!isSkillPath(path)) {
    return NextResponse.json(
      { error: "path must be a SKILL.md file under .claude/ or the root skills/ directory" },
      { status: 400 },
    );
  }

  try {
    const branch = await getDefaultBranch(token, parsed.owner, parsed.name);
    const content = await fetchFileContent(token, parsed.owner, parsed.name, path, branch);
    const { suggestions, rounds } = await runAnalysis(path, content);
    return NextResponse.json({
      path,
      branch,
      suggestions,
      rounds,
    } satisfies AnalyzeResponse);
  } catch (e) {
    const status = e instanceof GhError ? (e.status === 404 ? 404 : 502) : 502;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status },
    );
  }
}
