"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConnectButton from "@/components/ConnectButton";
import RepoPicker from "@/components/RepoPicker";
import SkillPanel from "@/components/SkillPanel";
import type {
  MeResponse,
  Repo,
  SkillsResponse,
  SkillResult,
} from "@/types";

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [scan, setScan] = useState<{
    loading: boolean;
    data: SkillsResponse | null;
    error: string | null;
  }>({ loading: false, data: null, error: null });
  const [results, setResults] = useState<Record<string, SkillResult>>({});
  const [running, setRunning] = useState(false);

  // analyzeAll loops need the latest results; mirror them in a ref
  const resultsRef = useRef(results);
  resultsRef.current = results;

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("auth_error");
    if (err) setAuthError(err);

    fetch("/api/me")
      .then((res) => res.json() as Promise<MeResponse>)
      .then((data) => {
        setMe(data);
        if (data.connected) loadRepos();
      })
      .catch(() =>
        setMe({ connected: false, config: { github: true, glm: true } }),
      );
  }, []);

  async function loadRepos() {
    try {
      const res = await fetch("/api/repos");
      const data = (await res.json()) as { repos?: Repo[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRepos(data.repos ?? []);
      setReposError(null);
    } catch (e) {
      setRepos([]);
      setReposError(e instanceof Error ? e.message : "Failed to fetch repositories");
    }
  }

  const selectRepo = useCallback((fullName: string) => {
    setRepo(fullName);
    setResults({});
    setScan({ loading: true, data: null, error: null });
    fetch(`/api/skills?repo=${encodeURIComponent(fullName)}`)
      .then(async (res) => {
        const data = (await res.json()) as SkillsResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setScan({ loading: false, data, error: null });
      })
      .catch((e: unknown) =>
        setScan({
          loading: false,
          data: null,
          error: e instanceof Error ? e.message : "Scan failed",
        }),
      );
  }, []);

  async function analyzeOne(path: string) {
    if (!repo || resultsRef.current[path]?.status === "analyzing") return;
    const started = Date.now();
    setResults((prev) => ({ ...prev, [path]: { status: "analyzing", thinking: "", suggestions: "" } }));

    // Stream accumulators; state is flushed at a throttled rate to keep rendering cheap
    let thinking = "";
    let text = "";
    let rounds: number | undefined;
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, path }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastFlush = 0;
      const flush = () => {
        const now = Date.now();
        if (now - lastFlush < 80) return; // throttle to ~12 renders/s
        lastFlush = now;
        setResults((prev) => ({
          ...prev,
          [path]: { status: "analyzing", thinking, suggestions: text, rounds },
        }));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: {
            type?: string;
            content?: string;
            round?: number;
            rounds?: number;
            suggestions?: string;
            error?: string;
          };
          try {
            ev = JSON.parse(line);
          } catch {
            continue; // skip malformed lines
          }
          if (ev.type === "thinking" && ev.content) {
            thinking += ev.content;
          } else if (ev.type === "text" && ev.content) {
            text += ev.content;
          } else if (ev.type === "round_start") {
            thinking += `\n\n— Round ${ev.round} —\n\n`;
            text = ""; // the last round's output wins
          } else if (ev.type === "done") {
            rounds = ev.rounds;
            if (ev.suggestions) text = ev.suggestions;
          } else if (ev.type === "error") {
            throw new Error(ev.error ?? "Analysis failed");
          }
          flush();
        }
      }
      setResults((prev) => ({
        ...prev,
        [path]: {
          status: "done",
          thinking,
          suggestions: text,
          rounds,
          elapsedMs: Date.now() - started,
        },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [path]: {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
          elapsedMs: Date.now() - started,
        },
      }));
    }
  }

  async function analyzeAll() {
    if (!scan.data || running) return;
    setRunning(true);
    for (const skill of scan.data.skills) {
      if (resultsRef.current[skill.path]?.status === "done") continue;
      await analyzeOne(skill.path);
    }
    setRunning(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe((prev) => (prev ? { ...prev, connected: false } : prev));
    setRepos(null);
    setRepo(null);
    setScan({ loading: false, data: null, error: null });
    setResults({});
  }

  const loadingMe = me === null;
  const connected = me?.connected ?? false;
  const githubConfigured = me?.config.github ?? true;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
            Evolve
            <span className="ml-3 text-sm font-normal text-zinc-500">
              AI Agent Skills Reviewer
            </span>
          </h1>
        </div>
        {!loadingMe && (
          <ConnectButton user={me?.user ?? null} onLogout={logout} />
        )}
      </header>

      {authError && (
        <div className="mt-6 flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>Authorization failed: {authError}</span>
          <button onClick={() => setAuthError(null)} className="text-red-400 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      {loadingMe ? (
        <div className="mt-24 text-center text-sm text-zinc-500">Loading…</div>
      ) : !connected ? (
        /* Not connected: hero */
        <div className="mt-24 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="KIRHA" className="h-20 w-20 rounded-2xl" />
          <h2 className="mt-6 text-2xl font-semibold text-zinc-50">
            Connect a GitHub repo and let GLM review your AI agent skills
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-400">
            After connecting, we scan the repo for <code className="text-zinc-300">SKILL.md</code> files
            (under <code className="text-zinc-300">.claude/</code> or the root{" "}
            <code className="text-zinc-300">skills/</code> directory), run each one through GLM,
            and present structured improvement suggestions.
          </p>
          {githubConfigured ? (
            <a
              href="/api/auth/github"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            >
              Connect GitHub to get started
            </a>
          ) : (
            <div className="mt-8 max-w-md rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm leading-6 text-amber-300">
              GitHub OAuth is not configured yet. Fill in <code>GITHUB_CLIENT_ID</code> and{" "}
              <code>GITHUB_CLIENT_SECRET</code> in <code>.env.local</code> (setup steps in the
              project README), then restart <code>npm run dev</code>.
            </div>
          )}
        </div>
      ) : (
        /* Connected: pick repo → scan → analyze */
        <div className="mt-10">
          <RepoPicker
            repos={repos ?? []}
            selected={repo}
            onSelect={selectRepo}
          />
          {reposError && (
            <p className="mt-2 text-xs text-amber-400">Failed to load repo list: {reposError} (you can still enter owner/name directly)</p>
          )}

          {repo && scan.loading && (
            <div className="py-16 text-center text-sm text-zinc-500">
              Scanning {repo} for skills…
            </div>
          )}
          {repo && scan.error && (
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              Scan failed: {scan.error}
            </div>
          )}
          {repo && scan.data && scan.data.skills.length === 0 && !scan.error && (
            <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-400">
              No <code className="text-zinc-200">SKILL.md</code> files found in{" "}
              <code className="text-zinc-200">{repo}</code>.
              <span className="mt-1 block text-xs text-zinc-500">
                Supported locations: .claude/skills/&lt;name&gt;/SKILL.md, root skills/&lt;name&gt;/SKILL.md, or a bare SKILL.md at the repo root
              </span>
            </div>
          )}
          {scan.data && scan.data.skills.length > 0 && (
            <SkillPanel
              repo={scan.data.repo}
              branch={scan.data.branch}
              skills={scan.data.skills}
              truncated={scan.data.truncated}
              results={results}
              running={running}
              onAnalyzeAll={analyzeAll}
              onAnalyzeOne={analyzeOne}
            />
          )}
        </div>
      )}

      <footer className="mt-16 border-t border-zinc-800 pt-4 text-center text-xs text-zinc-600">
        © 2026 KIRHA. All rights reserved.
      </footer>
    </main>
  );
}
