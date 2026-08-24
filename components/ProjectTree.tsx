"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProjects } from "@/components/ProjectsContext";
import type { ProjectTreeNode } from "@/lib/types";

function TreeNode({
  node,
  query,
}: {
  node: ProjectTreeNode;
  query: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const active = pathname === `/projects/${node.id}`;
  const q = query.trim().toLowerCase();
  const selfMatch =
    !q ||
    node.title.toLowerCase().includes(q) ||
    node.code.toLowerCase().includes(q);
  const filteredChildren = node.children.filter(matchesQuery(q));
  if (!selfMatch && filteredChildren.length === 0) return null;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md pr-2 ${
          active ? "bg-overlay" : "hover:bg-overlay/60"
        }`}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={() => setOpen((v) => !v)}
            className="h-7 w-6 shrink-0 text-[11px] text-muted"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="inline-block h-7 w-6" />
        )}
        <Link
          href={`/projects/${node.id}`}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5"
        >
          <span className={`status-dot ${node.status}`} />
          <span className="min-w-0">
            <span className="block truncate font-mono text-[11px] text-muted">
              {node.code}
            </span>
            <span className="block truncate text-[13px] text-ink">{node.title}</span>
          </span>
        </Link>
      </div>
      {open && filteredChildren.length > 0 ? (
        <div className="ml-3 border-l border-line pl-1">
          {filteredChildren.map((child) => (
            <TreeNode key={child.id} node={child} query={query} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function matchesQuery(q: string) {
  return function match(node: ProjectTreeNode): boolean {
    if (!q) return true;
    const self =
      node.title.toLowerCase().includes(q) || node.code.toLowerCase().includes(q);
    return self || node.children.some(match);
  };
}

export function ProjectTree() {
  const { tree, loading, error } = useProjects();
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => tree.filter(matchesQuery(query.trim().toLowerCase())),
    [tree, query],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          className="w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-6">
        {loading ? (
          <p className="px-2 text-[13px] text-muted">Loading…</p>
        ) : error ? (
          <p className="px-2 text-[13px] text-accent">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 text-[13px] text-muted">No projects yet.</p>
        ) : (
          filtered.map((node) => (
            <TreeNode key={node.id} node={node} query={query} />
          ))
        )}
      </div>
    </div>
  );
}
