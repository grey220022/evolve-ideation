"use client";

import { useMemo, useState } from "react";
import { normalizeRepo } from "@/lib/github";
import type { Repo } from "@/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RepoPicker({
  repos,
  selected,
  onSelect,
}: {
  repos: Repo[];
  selected: string | null;
  onSelect: (fullName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos
      .filter((r) => r.full_name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [repos, query]);

  // Support repos not in the list: owner/name, GitHub URLs, .git addresses, etc., normalized then opened directly
  const directName = normalizeRepo(query.trim());

  function pick(fullName: string) {
    setQuery("");
    setOpen(false);
    onSelect(fullName);
  }

  return (
    <div className="relative">
      <input
        value={open ? query : selected ?? query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search, or enter owner/name / GitHub URL…"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500"
      />

      {open && (
        <>
          {/* Click-away layer to close the dropdown */}
          <div className="fixed inset-0 z-10" onMouseDown={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
            {directName && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(directName);
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-indigo-300 hover:bg-zinc-800"
              >
                <span>
                  Use <span className="font-medium">{directName}</span>
                </span>
                <span className="text-xs text-zinc-500">open directly</span>
              </button>
            )}

            {filtered.map((repo) => (
              <button
                key={repo.full_name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(repo.full_name);
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-800 ${
                  repo.full_name === selected ? "bg-zinc-800/60" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-zinc-100">
                    {repo.full_name}
                  </span>
                  {repo.description && (
                    <span className="block truncate text-xs text-zinc-500">
                      {repo.description}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      repo.private
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {repo.private ? "Private" : "Public"}
                  </span>
                  <span>{formatDate(repo.updated_at)}</span>
                </span>
              </button>
            ))}

            {!directName && filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-zinc-500">
                No matching repos — enter owner/name or paste a GitHub repo URL to open directly
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
