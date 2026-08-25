"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { findTreeNode, useProjects } from "@/components/ProjectsContext";
import { ProjectTree } from "@/components/ProjectTree";
import { kindLabel } from "@/lib/format";
import {
  parseProjectView,
  projectViewHref,
} from "@/lib/project-view";
import { ASSET_KINDS } from "@/lib/types";

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const { projects, tree, loading } = useProjects();
  const searchParams = useSearchParams();
  const view = parseProjectView(searchParams.get("view"));
  const project = projects.find((item) => item.id === projectId);
  const node = findTreeNode(tree, projectId);
  const parent = project?.parentId
    ? projects.find((item) => item.id === project.parentId)
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 py-3">
        {parent ? (
          <Link
            href={`/projects/${parent.id}`}
            className="text-[12px] text-muted hover:text-ink"
          >
            ← {parent.code}
          </Link>
        ) : (
          <Link href="/" className="text-[12px] text-muted hover:text-ink">
            ← Workshop
          </Link>
        )}
        {project ? (
          <div className="mt-2 flex min-w-0 items-start gap-2">
            <span className={`status-dot mt-1.5 ${project.status}`} />
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px] text-muted">
                {project.code}
              </div>
              <div className="truncate text-[13px] text-ink">{project.title}</div>
            </div>
          </div>
        ) : loading ? (
          <p className="mt-2 text-[13px] text-muted">Loading…</p>
        ) : (
          <p className="mt-2 text-[13px] text-muted">Project not found.</p>
        )}
        <nav className="mt-3 -mx-1">
          <SideLink
            href={projectViewHref(projectId)}
            label="Overview"
            active={view === "overview"}
          />
          {ASSET_KINDS.map((kind) => (
            <SideLink
              key={kind}
              href={projectViewHref(projectId, kind)}
              label={kindLabel(kind)}
              count={project?.assetsByKind[kind] ?? 0}
              active={view === kind}
            />
          ))}
          <SideLink
            href={projectViewHref(projectId, "nested")}
            label="Projects"
            count={project?.childCount ?? 0}
            active={view === "nested"}
          />
        </nav>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <p className="px-3 pt-3 text-[11px] uppercase tracking-wider text-muted">
          Nested projects
        </p>
        <ProjectTree
          roots={node?.children ?? []}
          searchPlaceholder="Search nested"
          emptyLabel="No nested projects."
        />
      </div>
    </div>
  );
}

function SideLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] ${
        active ? "bg-overlay text-ink" : "text-muted hover:bg-overlay/60 hover:text-ink"
      }`}
    >
      <span>{label}</span>
      {count !== undefined ? (
        <span className="font-mono text-[11px] text-muted">{count}</span>
      ) : null}
    </Link>
  );
}
