import type { Repo, SkillFile } from "@/types";

const API = "https://api.github.com";
const TIMEOUT_MS = 30_000;

export class GhError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Normalizes various GitHub repo inputs to owner/name:
 * - owner/name
 * - https://github.com/owner/name (protocol optional; tolerates trailing slashes, .git suffix, and tail paths like /tree/main)
 * - git@github.com:owner/name.git (SSH form)
 */
export function normalizeRepo(input: string): string | null {
  let s = input.trim();
  if (!s) return null;

  if (s.startsWith("git@")) {
    // SSH: git@github.com:owner/name.git
    const m = s.match(/^git@[^:]+:\/?(.+)$/);
    if (!m) return null;
    s = m[1];
  } else {
    // HTTP(S): strip the protocol and github.com domain
    s = s.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "");
  }

  // Take the first two path segments (ignore extra /tree/main, /blob/... segments) and drop a .git suffix
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const name = parts[1].replace(/\.git$/i, "");
  if (!owner || !name) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) return null;
  return `${owner}/${name}`;
}

export function parseRepo(repo: string): { owner: string; name: string } | null {
  const normalized = normalizeRepo(repo);
  if (!normalized) return null;
  const [owner, name] = normalized.split("/");
  return { owner, name };
}

async function ghFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `GitHub API error (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message += `: ${body.message}`;
    } catch {
      // keep the default message
    }
    throw new GhError(res.status, message);
  }
  return (await res.json()) as T;
}

export type GithubUser = { login: string; avatar_url: string; html_url: string };

export function getAuthenticatedUser(token: string): Promise<GithubUser> {
  return ghFetch<GithubUser>(token, "/user");
}

/** The authenticated user's repos, sorted by recent activity, up to 3 pages (300 repos) */
export async function listRepos(token: string): Promise<Repo[]> {
  const repos: Repo[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await ghFetch<Repo[]>(
      token,
      `/user/repos?sort=updated&per_page=100&page=${page}`,
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

type RepoInfo = { default_branch: string };

export async function getDefaultBranch(
  token: string,
  owner: string,
  name: string,
): Promise<string> {
  const info = await ghFetch<RepoInfo>(token, `/repos/${owner}/${name}`);
  return info.default_branch;
}

type TreeItem = {
  path: string;
  type: string;
  size?: number;
};

type TreeResponse = {
  tree: TreeItem[];
  truncated?: boolean;
};

async function getRepoTree(
  token: string,
  owner: string,
  name: string,
  ref: string,
): Promise<TreeResponse> {
  return ghFetch<TreeResponse>(
    token,
    `/repos/${owner}/${name}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
}

/** Derives the skill display name from its path: prefer the parent directory (.claude/skills/foo/SKILL.md → foo) */
function deriveSkillName(path: string): string {
  const parts = path.split("/");
  const file = parts[parts.length - 1];
  const parent = parts[parts.length - 2];
  if (parent && parent !== ".claude") return parent;
  return file.replace(/\.md$/i, "");
}

/** Skill file predicate: any depth under .claude/, any depth under the root skills/ dir, or a bare SKILL.md at the repo root (single-skill repos); filename case-insensitive */
export function isSkillPath(path: string): boolean {
  const file = (path.split("/").pop() ?? "").toLowerCase();
  if (file !== "skill.md") return false;
  return path.startsWith(".claude/") || path.startsWith("skills/") || path === "SKILL.md";
}

/**
 * Finds all SKILL.md files in the repo tree, covering the common layouts:
 * .claude/skills/<name>/SKILL.md (project-bundled), skills/<name>/SKILL.md (skill
 * collection repos), and a bare SKILL.md at the repo root (single-skill repos).
 */
export async function listSkillFiles(
  token: string,
  owner: string,
  name: string,
  branch: string,
): Promise<{ skills: SkillFile[]; truncated: boolean }> {
  const tree = await getRepoTree(token, owner, name, branch);
  const skills = tree.tree
    .filter((item) => item.type === "blob" && isSkillPath(item.path))
    .map((item) => ({
      path: item.path,
      // A bare root SKILL.md represents the whole repo — use the repo name as the display name
      name: item.path === "SKILL.md" ? name : deriveSkillName(item.path),
      size: item.size ?? null,
      html_url: `https://github.com/${owner}/${name}/blob/${branch}/${item.path}`,
    }));
  return { skills, truncated: Boolean(tree.truncated) };
}

type ContentResponse = {
  content?: string;
  encoding?: string;
  size: number;
};

/** Reads a file as text via the contents API (base64-decoded; supports files up to 1MB) */
export async function fetchFileContent(
  token: string,
  owner: string,
  name: string,
  path: string,
  ref: string,
): Promise<string> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const data = await ghFetch<ContentResponse>(
    token,
    `/repos/${owner}/${name}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
  );
  if (!data.content || data.encoding !== "base64") {
    throw new Error(
      `File unreadable or larger than 1MB (${data.size ?? "?"} bytes) — not supported in this MVP`,
    );
  }
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
}
