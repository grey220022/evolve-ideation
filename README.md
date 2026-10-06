# Evolve — AI Agent Skills Reviewer (MVP)

Connect a GitHub repo → scan for `SKILL.md` files (under `.claude/` or the root `skills/` directory) → run each one through GLM (Zhipu) → present structured improvement suggestions.

```
Browser ──OAuth──▶ GitHub ──▶ repo file tree, filtered to .claude/**/SKILL.md + skills/**/SKILL.md
                 GLM  ◀──each SKILL.md── backend (Next.js Route Handlers)
Browser ◀──suggestions (rendered Markdown)── backend
```

## Tech Stack

- Next.js (App Router, full-stack in one) + TypeScript + Tailwind CSS
- GLM via native fetch (OpenAI-compatible and Anthropic-compatible endpoints, no SDK)
- No database: the GitHub token lives in an httpOnly cookie; analysis results live in frontend state

## Setup

### 1. Create a GitHub OAuth App

Open <https://github.com/settings/developers> → **New OAuth App**:

| Field | Value |
|---|---|
| Application name | Evolve (anything) |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/github/callback` |

Copy the **Client ID**, then click **Generate a new client secret** for the **Client Secret**.

### 2. Get a GLM API key

Open <https://open.bigmodel.cn> → console → API Keys. New accounts usually have free quota.

Note: a **GLM Coding Plan** subscription uses the Anthropic-compatible endpoint (`/api/anthropic`) — that's the default here, so paid models like `glm-5.3` work through your plan quota. Pay-as-you-go keys should switch `GLM_BASE_URL` to `https://open.bigmodel.cn/api/paas/v4`.

### 3. Configure environment variables

```bash
cp .env.example .env.local
# edit .env.local and fill in the values above
```

### 4. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Usage

1. Click "Connect GitHub" → authorize on GitHub → redirected back
2. Pick a repo from the dropdown (your repos, sorted by recent activity), or type/paste any of: `owner/name`, `https://github.com/owner/name`, a `.git` address, an SSH address (`git@github.com:owner/name.git`), or even a link with a `/tree/main` tail path — input is normalized automatically. Public repos work without forking.
3. The app scans for `SKILL.md` files (case-insensitive filename): any depth under `.claude/` (e.g. `.claude/skills/<name>/SKILL.md`), the root `skills/<name>/SKILL.md` layout used by plugin/skill-collection repos, and a bare `SKILL.md` at the repo root (single-skill repos — displayed under the repo name)
4. Click "Analyze all" to review skills one by one via GLM; each skill can also be analyzed or re-analyzed individually. Click a row to expand the rendered review.

## Configuration

| Env var | Default | Description |
|---|---|---|
| `GLM_BASE_URL` | `https://open.bigmodel.cn/api/anthropic` | Anthropic-compatible endpoint (coding plan). Pay-as-you-go: `https://open.bigmodel.cn/api/paas/v4` (OpenAI protocol is auto-selected from the URL) |
| `GLM_MODEL` | `glm-4.6` | Any model your key supports (list via `GET {GLM_BASE_URL}/v1/models`) |
| `ANALYSIS_ROUNDS` | `1` | **1 = single-pass quick review**; raise it (2, 3, …) for multi-round mode: each round carries the full conversation history and critically deepens the previous one; the last round's output wins |

## Timing expectations & streaming

Each skill analysis makes 2 GitHub API calls (< 1s combined) plus 1 GLM call, which dominates: thinking models like `glm-5.3` generate at roughly 60–70 tokens/s, so a full review typically takes 30–90 seconds per skill. The review is streamed live (NDJSON): the model's reasoning trace appears first, then the report renders progressively as it is written. Total duration is unchanged by streaming — it is a perceived-latency improvement. The UI shows per-skill elapsed time, and "Analyze all" runs skills sequentially to avoid rate limits and to show natural progress.

## MVP boundaries (not implemented)

- Suggestions are display-only; nothing is written back to GitHub (branch/PR creation could come next)
- No user accounts or persistence — refreshing clears analysis results
- SKILL.md files larger than 1MB are unsupported (contents API limit)
