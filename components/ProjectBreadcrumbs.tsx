"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProjects } from "@/components/ProjectsContext";
import { settingsItemForPath } from "@/lib/settings";
import type { ProjectDTO } from "@/lib/types";

function ancestorsOf(projects: ProjectDTO[], id: string): ProjectDTO[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const chain: ProjectDTO[] = [];
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current?.parentId) {
    if (seen.has(current.parentId)) break;
    seen.add(current.parentId);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export function ProjectBreadcrumbs() {
  const pathname = usePathname();
  const { projects } = useProjects();
  const match = pathname.match(/^\/projects\/([^/]+)$/);
  const projectId = match?.[1];
  const project = projectId
    ? projects.find((p) => p.id === projectId)
    : undefined;
  const ancestors = project ? ancestorsOf(projects, project.id) : [];
  const settingsItem = settingsItemForPath(pathname);
  const onHome = pathname === "/";

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto text-[12px] text-muted"
    >
      {onHome ? (
        <span className="shrink-0 text-ink">Workshop</span>
      ) : (
        <Link href="/" className="shrink-0 hover:text-ink">
          Workshop
        </Link>
      )}
      {pathname.startsWith("/settings") ? (
        <>
          <span>/</span>
          <Link href="/settings" className="shrink-0 hover:text-ink">
            Settings
          </Link>
          {settingsItem ? (
            <>
              <span>/</span>
              <span className="shrink-0 text-ink">{settingsItem.label}</span>
            </>
          ) : null}
        </>
      ) : null}
      {ancestors.map((a) => (
        <span key={a.id} className="flex shrink-0 items-center gap-2">
          <span>/</span>
          <Link
            href={`/projects/${a.id}`}
            className="font-mono hover:text-ink"
          >
            {a.code}
          </Link>
        </span>
      ))}
      {project ? (
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">/</span>
          <span className="truncate font-mono text-ink">{project.code}</span>
        </span>
      ) : null}
    </nav>
  );
}
