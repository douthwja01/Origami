"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectForm } from "@/components/ProjectForm";
import { VaultExplorer } from "@/components/VaultExplorer";
import { useProjects } from "@/components/ProjectsContext";
import { formatDate, statusLabel } from "@/lib/format";
import type { ProjectDetail } from "@/lib/types";

export function ProjectWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const { refresh } = useProjects();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Project not found");
      setData(null);
      return;
    }
    setError(null);
    setData(json);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const project = data?.project;

  async function archive() {
    if (!project) return;
    setBusy(true);
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: project.status === "archived" ? "active" : "archived",
      }),
    });
    await Promise.all([load(), refresh()]);
    setBusy(false);
  }

  async function remove(cascade: boolean) {
    if (!project) return;
    setBusy(true);
    const res = await fetch(
      `/api/projects/${project.id}${cascade ? "?cascade=1" : ""}`,
      { method: "DELETE" },
    );
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error);
      setConfirmDelete(true);
      return;
    }
    await refresh();
    router.push("/");
  }

  return (
    <>
      <main className="flex h-full min-h-0 flex-col px-5 py-4 lg:px-8">
        {error && !data ? <p className="text-accent">{error}</p> : null}
        {project ? (
          <>
            <nav className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <Link href="/" className="hover:text-ink">
                Workshop
              </Link>
              {data?.ancestors.map((a) => (
                <span key={a.id} className="flex items-center gap-2">
                  <span>/</span>
                  <Link href={`/projects/${a.id}`} className="hover:text-ink">
                    {a.code}
                  </Link>
                </span>
              ))}
              <span>/</span>
              <span className="text-ink">{project.code}</span>
            </nav>

            <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-muted">
                    {project.code}
                  </span>
                  <span className={`status-dot ${project.status}`} />
                  <span className="text-[12px] text-muted">
                    {statusLabel(project.status)}
                  </span>
                </div>
                <h1 className="mt-1 text-[22px] font-medium tracking-tight">
                  {project.title}
                </h1>
                <p className="text-[13px] text-muted">
                  Started {formatDate(project.startDate)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] hover:border-accent"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingChild(true)}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] hover:border-accent"
                >
                  New child
                </button>
                <button
                  type="button"
                  onClick={archive}
                  disabled={busy}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] hover:border-accent"
                >
                  {project.status === "archived" ? "Unarchive" : "Archive"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] text-accent hover:border-accent"
                >
                  Delete
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1">
              <VaultExplorer
                projectId={project.id}
                assets={data?.assets ?? []}
                nested={data?.children ?? []}
                onChanged={async () => {
                  await Promise.all([load(), refresh()]);
                }}
                onNewChild={() => setCreatingChild(true)}
              />
            </div>
          </>
        ) : !error ? (
          <p className="text-muted">Loading…</p>
        ) : null}
      </main>

      {editing && project ? (
        <ProjectForm
          title="Edit project"
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            load();
          }}
        />
      ) : null}
      {creatingChild && project ? (
        <ProjectForm
          title="New nested project"
          defaultParentId={project.id}
          onClose={() => setCreatingChild(false)}
          onSaved={() => {
            load();
          }}
        />
      ) : null}
      {confirmDelete && project ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[18vh]">
          <div className="w-full max-w-md rounded-xl border border-line bg-raised p-5">
            <h2 className="text-[16px] font-medium">Delete {project.code}?</h2>
            <p className="mt-2 text-[13px] text-muted">
              Nested projects and vault files are kept unless you delete them
              too.
            </p>
            {error ? <p className="mt-2 text-[13px] text-accent">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-2 text-[13px] text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(false)}
                className="rounded-md border border-line px-3 py-2 text-[13px]"
              >
                Delete project
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(true)}
                className="rounded-md bg-accent px-3 py-2 text-[13px] text-canvas"
              >
                Delete with nested + files
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
