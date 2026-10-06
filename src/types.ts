// Shared types between frontend and backend

export type GithubUser = {
  login: string;
  avatar_url: string;
  html_url: string;
};

export type Repo = {
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
  updated_at: string;
};

export type SkillFile = {
  /** Full path within the repo, e.g. .claude/skills/commit-helper/SKILL.md */
  path: string;
  /** Display name, usually the parent directory name */
  name: string;
  size: number | null;
  html_url: string;
};

export type SkillsResponse = {
  repo: string;
  branch: string;
  skills: SkillFile[];
  /** True when the file tree was truncated by GitHub; some files may be missing */
  truncated: boolean;
};

export type SkillStatus = "pending" | "analyzing" | "done" | "error";

export type SkillResult = {
  status: SkillStatus;
  /** Model reasoning trace, streamed live during analysis */
  thinking?: string;
  /** Review report — filled progressively while streaming, complete when done */
  suggestions?: string;
  rounds?: number;
  error?: string;
  elapsedMs?: number;
};

export type MeResponse = {
  connected: boolean;
  user?: GithubUser;
  /** Whether each external dependency is configured via env vars (no values leaked) */
  config: {
    github: boolean;
    glm: boolean;
  };
};
