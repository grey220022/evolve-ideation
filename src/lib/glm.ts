import { deepeningPrompt, firstRoundPrompt, systemPrompt } from "@/lib/prompt";

type Turn = {
  role: "user" | "assistant";
  content: string;
};

const TIMEOUT_MS = 180_000;
const TEMPERATURE = 0.3;
/** Required by the Anthropic protocol; glm-4.6+ produces thinking before the answer, so leave ample budget */
const MAX_TOKENS = 16384;

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

type AnthropicResponse = {
  content?: Array<{
    type: string;
    text?: string;
  }>;
};

type GlmChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function assertContent(text: string): string {
  if (!text.trim()) {
    throw new Error("GLM returned empty content");
  }
  return text;
}

/** Anthropic-compatible endpoint (/v1/messages): system is a top-level field, response is an array of content blocks */
async function chatAnthropic(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string,
  turns: Turn[],
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
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GLM API error (${res.status}): ${text.slice(0, 300) || res.statusText}`);
  }
  const data = (await res.json()) as AnthropicResponse;
  // Concatenate text blocks; drop thinking blocks (reasoning does not belong in the report)
  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("");
  return assertContent(text);
}

/** OpenAI-compatible endpoint (/chat/completions): system is the first message */
async function chatOpenAI(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string,
  turns: Turn[],
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
      stream: false,
      messages: [{ role: "system", content: system }, ...turns],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GLM API error (${res.status}): ${text.slice(0, 300) || res.statusText}`);
  }
  const data = (await res.json()) as GlmChatResponse;
  return assertContent(data.choices?.[0]?.message?.content ?? "");
}

export type AnalysisResult = {
  suggestions: string;
  rounds: number;
};

/**
 * Runs the review for a single SKILL.md.
 * ANALYSIS_ROUNDS=1 by default (single-pass quick review); raise it to enable
 * multi-round mode: each round carries the full conversation history and
 * critically deepens the previous one; the last round's output wins.
 */
export async function runAnalysis(
  skillPath: string,
  skillContent: string,
): Promise<AnalysisResult> {
  const { apiKey, baseUrl, model, protocol } = glmConfig();
  const rounds = Math.max(1, Number(process.env.ANALYSIS_ROUNDS) || 1);
  const system = systemPrompt();
  const turns: Turn[] = [];

  let suggestions = "";
  for (let round = 1; round <= rounds; round++) {
    turns.push({
      role: "user",
      content: round === 1 ? firstRoundPrompt(skillPath, skillContent) : deepeningPrompt(round),
    });
    suggestions =
      protocol === "anthropic"
        ? await chatAnthropic(apiKey, baseUrl, model, system, turns)
        : await chatOpenAI(apiKey, baseUrl, model, system, turns);
    turns.push({ role: "assistant", content: suggestions });
  }

  return { suggestions, rounds };
}
