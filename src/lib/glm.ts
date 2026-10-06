import { deepeningPrompt, firstRoundPrompt, systemPrompt } from "@/lib/prompt";

type Turn = {
  role: "user" | "assistant";
  content: string;
};

const TIMEOUT_MS = 180_000;
const TEMPERATURE = 0.3;
/** Required by the Anthropic protocol; thinking models produce reasoning before the answer, so leave ample budget */
const MAX_TOKENS = 16384;

export type DeltaKind = "thinking" | "text";
export type DeltaHandler = (kind: DeltaKind, content: string) => void;

export function glmConfig() {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    throw new Error("GLM_API_KEY is not configured; set it in .env.local");
  }
  const baseUrl = (process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/anthropic").replace(
    /\/+$/,
    "",
  );
  const model = process.env.GLM_MODEL || "glm-4.6";
  // GLM Coding Plan uses the Anthropic-compatible endpoint; pay-as-you-go keys use the OpenAI-compatible one
  const protocol: "anthropic" | "openai" = /\/anthropic$/.test(baseUrl)
    ? "anthropic"
    : "openai";
  return { apiKey, baseUrl, model, protocol };
}

/** Parses "data: {...}" SSE frames from a response body and yields each JSON payload */
async function* sseEvents(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload) as Record<string, unknown>;
      } catch {
        // skip malformed frames
      }
    }
  }
}

async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new Error(`GLM API error (${res.status}): ${text.slice(0, 300) || res.statusText}`);
}

/**
 * Anthropic-compatible endpoint (/v1/messages), streamed.
 * thinking_delta chunks are surfaced as "thinking"; text_delta as "text".
 */
async function chatAnthropic(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string,
  turns: Turn[],
  onDelta?: DeltaHandler,
): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system,
      messages: turns,
      stream: true,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await assertOk(res);

  let text = "";
  for await (const ev of sseEvents(res)) {
    if (ev.type === "error") {
      throw new Error(`GLM stream error: ${JSON.stringify(ev.error ?? ev).slice(0, 200)}`);
    }
    if (ev.type !== "content_block_delta") continue;
    const delta = ev.delta as
      | { type?: string; text?: string; thinking?: string }
      | undefined;
    if (!delta) continue;
    if (delta.type === "text_delta" && delta.text) {
      text += delta.text;
      onDelta?.("text", delta.text);
    } else if (delta.type === "thinking_delta" && delta.thinking) {
      onDelta?.("thinking", delta.thinking);
    }
  }
  return text;
}

/**
 * OpenAI-compatible endpoint (/chat/completions), streamed.
 * delta.content is the answer; delta.reasoning_content is the thinking trace.
 */
async function chatOpenAI(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string,
  turns: Turn[],
  onDelta?: DeltaHandler,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: TEMPERATURE,
      stream: true,
      messages: [{ role: "system", content: system }, ...turns],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await assertOk(res);

  let text = "";
  for await (const ev of sseEvents(res)) {
    const delta = (
      ev.choices as Array<{ delta?: { content?: string; reasoning_content?: string } }> | undefined
    )?.[0]?.delta;
    if (!delta) continue;
    if (delta.reasoning_content) onDelta?.("thinking", delta.reasoning_content);
    if (delta.content) {
      text += delta.content;
      onDelta?.("text", delta.content);
    }
  }
  return text;
}

export type AnalysisResult = {
  suggestions: string;
  rounds: number;
};

/**
 * Runs the streamed review for a single SKILL.md. Deltas (thinking + answer
 * text) are forwarded to onDelta as they arrive, so callers can render them live.
 * ANALYSIS_ROUNDS=1 by default (single-pass quick review); raise it to enable
 * multi-round mode: each round carries the full conversation history and
 * critically deepens the previous one; the last round's output wins.
 */
export async function runAnalysis(
  skillPath: string,
  skillContent: string,
  onDelta?: DeltaHandler,
  onRoundStart?: (round: number) => void,
): Promise<AnalysisResult> {
  const { apiKey, baseUrl, model, protocol } = glmConfig();
  const rounds = Math.max(1, Number(process.env.ANALYSIS_ROUNDS) || 1);
  const system = systemPrompt();
  const turns: Turn[] = [];

  let suggestions = "";
  for (let round = 1; round <= rounds; round++) {
    onRoundStart?.(round);
    turns.push({
      role: "user",
      content: round === 1 ? firstRoundPrompt(skillPath, skillContent) : deepeningPrompt(round),
    });
    suggestions =
      protocol === "anthropic"
        ? await chatAnthropic(apiKey, baseUrl, model, system, turns, onDelta)
        : await chatOpenAI(apiKey, baseUrl, model, system, turns, onDelta);
    turns.push({ role: "assistant", content: suggestions });
  }

  if (!suggestions.trim()) {
    throw new Error("GLM returned empty content");
  }
  return { suggestions, rounds };
}
