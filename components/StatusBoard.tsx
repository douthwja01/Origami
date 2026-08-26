"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProjects } from "@/components/ProjectsContext";
import { useProjectDisplay } from "@/components/ProjectDisplayContext";
import { formatDate, statusLabel } from "@/lib/format";
import { BOARD_STATUSES, type ProjectDTO, type ProjectStatus } from "@/lib/types";

export function StatusBoard() {
  const { projects, loading } = useProjects();
  const { settings } = useProjectDisplay();
  const [scope, setScope] = useState<"top" | "all">("top");

  const visible = useMemo(() => {
    const pool =
      scope === "top" ? projects.filter((p) => !p.parentId) : projects;
    return pool.filter((p) => p.status !== "archived");
  }, [projects, scope]);

  const grouped = useMemo(() => {
    const map: Record<ProjectStatus, ProjectDTO[]> = {
      planned: [],
      active: [],
      on_hold: [],
      done: [],
      archived: [],
    };
    for (const project of visible) {
      map[project.status].push(project);
    }
    return map;
  }, [visible]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight">
            {settings.vaultName}
          </h1>
          <p className="text-[13px] text-muted">
            Nested projects and a vault for media, code, documents, and CAD.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          Show
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "top" | "all")}
            className="rounded-md border border-line bg-raised px-2 py-1 text-ink"
          >
            <option value="top">Top-level</option>
            <option value="all">All projects</option>
          </select>
        </label>
      </div>
      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_STATUSES.map((status) => (
            <section key={status} className="rounded-xl border border-line bg-raised p-3">
              <header className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-muted">
                  <span className={`status-dot ${status}`} />
                  {statusLabel(status)}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {grouped[status].length}
                </span>
              </header>
              <div className="flex flex-col gap-2">
                {grouped[status].length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12px] text-muted">Empty</p>
                ) : (
                  grouped[status].map((project) => (
                    <BoardCard key={project.id} project={project} />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BoardCard({ project }: { project: ProjectDTO }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block rounded-lg border border-line bg-canvas px-3 py-2.5 hover:border-accent/50"
    >
      <div className="font-mono text-[11px] text-muted">{project.code}</div>
      <div className="truncate text-[14px]">{project.title}</div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{formatDate(project.startDate)}</span>
        <span>
          {project.childCount} nested · {project.assetCount} files
        </span>
      </div>
    </Link>
  );
}
