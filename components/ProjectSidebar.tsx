"use client";

import Link from "next/link";
import { findTreeNode, useProjects } from "@/components/ProjectsContext";
import { ProjectTree } from "@/components/ProjectTree";

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const { projects, tree, loading } = useProjects();
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
