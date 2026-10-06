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

type AnalyzeBody = {
  repo?: string;
  path?: string;
};

/**
 * Analyzes a single SKILL.md and streams the review live.
 * POST { repo: "owner/name", path: ".claude/skills/<name>/SKILL.md" }
 *
 * The response body is NDJSON (one JSON object per line):
 *   {"type":"meta","branch":"main"}
 *   {"type":"thinking","content":"..."}   — model reasoning, streamed
 *   {"type":"text","content":"..."}       — review report, streamed
 *   {"type":"round_start","round":2}      — only when ANALYSIS_ROUNDS > 1
 *   {"type":"done","rounds":1,"suggestions":"..."}
 *   {"type":"error","error":"..."}        — terminal on failure
 *
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const branch = await getDefaultBranch(token, parsed.owner, parsed.name);
        send({ type: "meta", branch });
        const content = await fetchFileContent(token, parsed.owner, parsed.name, path, branch);
        const { suggestions, rounds } = await runAnalysis(
          path,
          content,
          (kind, chunk) => send({ type: kind, content: chunk }),
          (round) => send({ type: "round_start", round }),
        );
        send({ type: "done", rounds, suggestions });
      } catch (e) {
        const status = e instanceof GhError ? e.status : undefined;
        send({
          type: "error",
          error: e instanceof Error ? e.message : "Analysis failed",
          ...(status ? { status } : {}),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Disable proxy buffering so chunks reach the browser as they are produced
      "X-Accel-Buffering": "no",
    },
  });
}
