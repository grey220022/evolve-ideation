"use client";

import { useEffect, useRef, useState } from "react";
import MarkdownView from "@/components/MarkdownView";
import type { SkillFile, SkillResult, SkillStatus } from "@/types";

/** Live-streamed model reasoning: dim box, auto-scrolled to the bottom as it grows */
function ThinkingStream({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [content]);
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
        Thinking…
      </div>
      <div
        ref={ref}
        className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs leading-5 text-zinc-500"
      >
        {content}
      </div>
    </div>
  );
}

const STATUS_META: Record<SkillStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-zinc-800 text-zinc-400" },
  analyzing: { label: "Analyzing…", className: "bg-amber-500/15 text-amber-400" },
  done: { label: "Done", className: "bg-emerald-500/15 text-emerald-400" },
  error: { label: "Failed", className: "bg-red-500/15 text-red-400" },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function SkillPanel({
  repo,
  branch,
  skills,
  truncated,
  results,
  running,
  onAnalyzeAll,
  onAnalyzeOne,
}: {
  repo: string;
  branch: string;
  skills: SkillFile[];
  truncated: boolean;
  results: Record<string, SkillResult>;
  running: boolean;
  onAnalyzeAll: () => void;
  onAnalyzeOne: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const statuses = skills.map((s) => results[s.path]?.status ?? "pending");
  const doneCount = statuses.filter((s) => s === "done").length;
  const allDone = doneCount === skills.length;
  const startedCount = statuses.filter((s) => s !== "pending" && s !== "error").length;

  return (
    <section>
      {/* Header: repo info + analysis controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-zinc-100">{repo}</h2>
          <p className="text-xs text-zinc-500">
            Default branch {branch} · {skills.length} skill{skills.length === 1 ? "" : "s"} found
            {truncated && (
              <span className="ml-1 text-amber-400"> (file tree truncated by GitHub; results may be incomplete)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <span className="text-xs text-zinc-400">
              Progress {doneCount}/{skills.length}
            </span>
          )}
          <button
            onClick={onAnalyzeAll}
            disabled={running || skills.length === 0}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {running
              ? "Analyzing…"
              : doneCount > 0
                ? allDone
                  ? "Re-analyze all"
                  : `Continue (${skills.length - startedCount} left)`
                : "Analyze all"}
          </button>
        </div>
      </div>

      {/* Skill list */}
      <div className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
        {skills.map((skill) => {
          const result = results[skill.path];
          const status: SkillStatus = result?.status ?? "pending";
          const meta = STATUS_META[status];
          const isOpen = expanded[skill.path] ?? false;
          return (
            <div key={skill.path}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [skill.path]: !isOpen }))}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{isOpen ? "▾" : "▸"}</span>
                    <span className="truncate font-medium text-zinc-100">{skill.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${meta.className}`}>
                      {meta.label}
                    </span>
                    {result?.rounds && result.rounds > 1 && (
                      <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-xs text-indigo-300">
                        {result.rounds} rounds
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate pl-5 text-xs text-zinc-500">
                    {skill.path}
                    {skill.size != null && ` · ${formatSize(skill.size)}`}
                    {result?.elapsedMs != null && status === "done" &&
                      ` · took ${(result.elapsedMs / 1000).toFixed(1)}s`}
                  </span>
                </button>
                <button
                  onClick={() => onAnalyzeOne(skill.path)}
                  disabled={running || status === "analyzing"}
                  className="shrink-0 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {status === "done" || status === "error" ? "Re-analyze" : "Analyze"}
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-zinc-800 bg-zinc-950/60 px-5 py-4">
                  {status === "error" && (
                    <p className="text-sm text-red-400">{result?.error ?? "Unknown error"}</p>
                  )}
                  {status === "done" && result?.suggestions && (
                    <>
                      <MarkdownView content={result.suggestions} />
                      {result.thinking && (
                        <details className="mt-4">
                          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                            Model reasoning
                          </summary>
                          <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs leading-5 text-zinc-500">
                            {result.thinking}
                          </div>
                        </details>
                      )}
                    </>
                  )}
                  {status === "analyzing" && (
                    <div className="space-y-4">
                      {result?.thinking ? (
                        <ThinkingStream content={result.thinking} />
                      ) : (
                        <p className="text-sm text-zinc-500">Connecting to GLM…</p>
                      )}
                      {result?.suggestions && (
                        <div>
                          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                            Writing review…
                          </div>
                          <MarkdownView content={result.suggestions + " ▍"} />
                        </div>
                      )}
                    </div>
                  )}
                  {status === "pending" && (
                    <p className="text-sm text-zinc-500">Not analyzed yet. Click "Analyze" to start.</p>
                  )}
                  <div className="mt-3">
                    <a
                      href={skill.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                    >
                      View source on GitHub ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
